import { expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { readRecords, readSpans } from "../src/telemetry";

it.effect("does not decode an unfinished collector write", () => {
  const fs = FileSystem.makeNoop({
    exists: () => Effect.succeed(true),
    readDirectory: () => Effect.succeed(["logs.jsonl"]),
    readFileString: () => Effect.succeed('{"complete":true}\n{"partial":'),
  });

  return readRecords("logs").pipe(
    Effect.tap((records) => Effect.sync(() => expect(records).toEqual(['{"complete":true}']))),
    Effect.provideService(FileSystem.FileSystem, fs),
  );
});

it.effect("combines rotated spans and preserves cross-process parents and resource context", () => {
  const batch = (spanId: string, parentSpanId: string, service: string) =>
    JSON.stringify({
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: service } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "12345678901234567890123456789012",
                  spanId,
                  parentSpanId,
                  name: service,
                  startTimeUnixNano: spanId,
                },
              ],
            },
          ],
        },
      ],
    });
  const fs = FileSystem.makeNoop({
    exists: () => Effect.succeed(true),
    readDirectory: () => Effect.succeed(["traces.jsonl", "traces-2026.jsonl", "logs.jsonl"]),
    readFileString: (path) =>
      Effect.succeed(
        path.endsWith("traces.jsonl")
          ? `${batch("2", "1", "worker")}\n{"unfinished":`
          : `${batch("1", "", "web")}\n`,
      ),
  });

  return Effect.gen(function* () {
    const spans = yield* readSpans();

    expect(spans.map((span) => span.name)).toEqual(["web", "worker"]);
    expect(spans[1]?.parentSpanId).toBe(spans[0]?.spanId);
    expect(spans[1]?.resource).toEqual({
      attributes: [{ key: "service.name", value: { stringValue: "worker" } }],
    });
  }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
});
