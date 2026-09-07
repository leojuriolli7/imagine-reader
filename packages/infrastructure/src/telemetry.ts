import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Schema } from "effect";

const directory = fileURLToPath(new URL("../.data/telemetry/", import.meta.url));
const Span = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.optional(Schema.String),
  name: Schema.String,
  startTimeUnixNano: Schema.String,
  endTimeUnixNano: Schema.optional(Schema.String),
  attributes: Schema.optional(Schema.Array(Schema.Unknown)),
  events: Schema.optional(Schema.Array(Schema.Unknown)),
  status: Schema.optional(Schema.Unknown),
});
const TraceBatch = Schema.Struct({
  resourceSpans: Schema.Array(
    Schema.Struct({
      resource: Schema.optional(Schema.Unknown),
      scopeSpans: Schema.Array(Schema.Struct({ spans: Schema.Array(Span) })),
    }),
  ),
});

/** Only complete records are visible while the collector is appending a batch. */
const completeRecords = (content: string) =>
  content
    .slice(0, content.lastIndexOf("\n") + 1)
    .split("\n")
    .filter(Boolean);

/** Rotation bounds disk usage; read each retained file, including the current one. */
export const readRecords = Effect.fn("Telemetry.readRecords")(function* (
  signal: "traces" | "logs",
) {
  const fs = yield* FileSystem.FileSystem;

  if (!(yield* fs.exists(directory))) return [];

  const files = (yield* fs.readDirectory(directory))
    .filter((name) => name === `${signal}.jsonl` || name.startsWith(`${signal}-`))
    .sort();
  const records: string[] = [];

  for (const name of files) {
    const content = yield* fs
      .readFileString(`${directory}/${name}`)
      .pipe(
        Effect.catch((error) =>
          error.reason._tag === "NotFound" ? Effect.succeed("") : Effect.fail(error),
        ),
      );

    for (const record of completeRecords(content)) records.push(record);
  }

  return records;
});

/** Resource context is retained so spans from web and worker remain distinguishable. */
export const readSpans = Effect.fn("Telemetry.readSpans")(function* () {
  const records = yield* readRecords("traces");
  const batches = yield* Effect.forEach(records, (record) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(TraceBatch))(record),
  );

  return batches
    .flatMap((batch) =>
      batch.resourceSpans.flatMap((resource) =>
        resource.scopeSpans.flatMap((scope) =>
          scope.spans.map((span) => ({
            ...span,
            resource: resource.resource,
          })),
        ),
      ),
    )
    .sort((a, b) => a.startTimeUnixNano.localeCompare(b.startTimeUnixNano));
});
