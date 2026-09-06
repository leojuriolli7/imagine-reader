import { assert, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { InvalidInput } from "@imagine/contracts/errors";
import type { Job } from "@imagine/contracts/models";
import { ProviderError } from "../src/domain/errors";
import { Pipeline } from "../src/data/pipeline";
import { JobQueue } from "../src/data/ports";
import { Worker } from "../src/data/worker";

const job: Job = {
  id: "job",
  key: "plan:book:1",
  bookId: "book",
  kind: "plan",
  ref: "1",
  priority: 0,
  token: "token",
  attempts: 1,
  traceContext: null,
};

it.effect.each([
  { error: new InvalidInput({ message: "Invalid document" }), retryable: false },
  {
    error: new ProviderError({ message: "Rate limited", retryable: true, cause: 429 }),
    retryable: true,
  },
  {
    error: new ProviderError({ message: "Invalid API key", retryable: false, cause: 401 }),
    retryable: false,
  },
])("classifies job failures %#", ({ error, retryable }) =>
  Effect.gen(function* () {
    const failed = yield* Ref.make<boolean | null>(null);

    const completed = yield* Ref.make(false);

    const queue = Layer.succeed(
      JobQueue,
      JobQueue.of({
        claim: () => Effect.succeed(job),
        complete: () => Ref.set(completed, true),
        fail: (_job, _message, retry) => Ref.set(failed, retry),
        retry: () => Effect.void,
        status: () => Effect.succeed([]),
      }),
    );

    const pipeline = Layer.succeed(Pipeline, Pipeline.of({ run: () => Effect.fail(error) }));

    yield* Effect.gen(function* () {
      const worker = yield* Worker;

      yield* worker.tick(["plan"]);
    }).pipe(Effect.provide(Worker.layer.pipe(Layer.provide([queue, pipeline]))));

    assert.strictEqual(yield* Ref.get(completed), false);

    assert.strictEqual(yield* Ref.get(failed), retryable);
  }),
);

it.effect("continues the persisted trace in a separate worker invocation", () =>
  Effect.gen(function* () {
    const seen = yield* Ref.make("");

    const traceContext = {
      traceId: "1234567890abcdef1234567890abcdef",
      spanId: "1234567890abcdef",
      sampled: true,
    };

    const queue = Layer.succeed(
      JobQueue,
      JobQueue.of({
        claim: () => Effect.succeed({ ...job, traceContext }),
        complete: () => Effect.void,
        fail: () => Effect.void,
        retry: () => Effect.void,
        status: () => Effect.succeed([]),
      }),
    );

    const pipeline = Layer.succeed(
      Pipeline,
      Pipeline.of({
        run: () =>
          Effect.currentSpan.pipe(
            Effect.flatMap((span) => Ref.set(seen, span.traceId)),
            Effect.as(undefined),
            Effect.orDie,
          ),
      }),
    );

    yield* Effect.gen(function* () {
      const worker = yield* Worker;

      yield* worker.tick(["plan"]);
    }).pipe(Effect.provide(Worker.layer.pipe(Layer.provide([queue, pipeline]))));

    assert.strictEqual(yield* Ref.get(seen), traceContext.traceId);
  }),
);
