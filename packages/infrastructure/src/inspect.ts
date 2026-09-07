import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { readRecords, readSpans } from "./telemetry";

const traces = Command.make(
  "traces",
  {},
  Effect.fn("Telemetry.traces")(function* () {
    const spans = yield* readSpans();
    const ids = [...new Set(spans.map((span) => span.traceId))].slice(-20).reverse();

    yield* Console.log(
      JSON.stringify(
        ids.map((traceId) => ({
          traceId,
          spanCount: spans.filter((span) => span.traceId === traceId).length,
          root: spans.find((span) => span.traceId === traceId && !span.parentSpanId)?.name,
        })),
        null,
        2,
      ),
    );
  }),
);

const trace = Command.make(
  "trace",
  {
    id: Argument.string("trace-id").pipe(
      Argument.withSchema(Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{32}$/))),
    ),
  },
  Effect.fn("Telemetry.trace")(function* ({ id }) {
    const spans = (yield* readSpans()).filter(
      (span) => span.traceId.toLowerCase() === id.toLowerCase(),
    );

    yield* Console.log(JSON.stringify({ traceId: id, spans }, null, 2));
  }),
);

const events = Command.make(
  "events",
  {
    follow: Flag.boolean("follow").pipe(Flag.withDefault(false)),
  },
  Effect.fn("Telemetry.events")(function* ({ follow }) {
    let previous = new Set<string>();

    do {
      const records = yield* readRecords("logs");
      const fresh = records.filter((record) => !previous.has(record));

      for (const record of fresh) {
        const value = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
          record,
        );

        yield* Console.log(JSON.stringify(value));
      }

      previous = new Set(records);

      if (follow) yield* Effect.sleep("1 second");
    } while (follow);
  }),
);

Command.make("telemetry").pipe(
  Command.withSubcommands([traces, trace, events]),
  Command.run({ version: "0.0.1" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
