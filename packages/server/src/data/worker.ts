import type { JobKind } from "@imagine/contracts/models";
import { Context, Effect, Layer, Match, Metric, Tracer } from "effect";
import { BookPipeline } from "./book-pipeline";
import { BookWorkflow } from "../domain/book-workflow";
import { JobQueue } from "./ports";

const completed = Metric.counter("imagine.jobs.completed", { incremental: true });
const failedAttempts = Metric.counter("imagine.jobs.failed_attempts", { incremental: true });

const worker = Effect.gen(function* () {
  const queue = yield* JobQueue;

  const pipeline = yield* BookPipeline;

  const tick = Effect.fn("Worker.tick")(function* (kinds: readonly JobKind[]) {
    const job = yield* queue.claim(kinds);

    if (!job) return false;

    const attributes = {
      "job.id": job.id,
      "book.id": job.bookId,
      "job.kind": job.kind,
      "job.attempt": job.attempts,
    };

    // One durable queue attempt runs one provider request. No nested SDK retry loop.
    const attempt = pipeline.run(job).pipe(
      Effect.andThen(queue.complete(job)),
      Effect.tap(() => Metric.update(completed, 1)),
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* Metric.update(failedAttempts, 1);

          yield* Effect.logWarning("Job attempt failed", {
            jobId: job.id,
            kind: job.kind,
            errorTag: error._tag,
          });

          const retryable = Match.value(error).pipe(
            Match.tags({
              ProviderError: (failure) => failure.retryable,
              DatabaseError: (failure) => failure.retryable,
              StorageError: (failure) => failure.retryable,
              InvalidPlan: () => true,
              Conflict: () => true,
              InvalidInput: () => false,
              NotFound: () => false,
            }),
            Match.exhaustive,
          );

          yield* queue.fail(
            job,
            error._tag === "DatabaseError" || error._tag === "StorageError"
              ? `${error._tag}: ${error.operation}`
              : error.message,
            retryable,
          );
        }),
      ),
      Effect.withSpan("Worker.attempt", { attributes }),
      Effect.annotateLogs(attributes),
    );

    yield* job.traceContext
      ? attempt.pipe(Effect.withParentSpan(Tracer.externalSpan(job.traceContext)))
      : attempt;

    return true;
  });

  const lane = (kinds: readonly JobKind[]) =>
    Effect.forever(
      tick(kinds).pipe(
        Effect.flatMap((worked) => (worked ? Effect.void : Effect.sleep("1 second"))),
        Effect.catch((error) =>
          Effect.logError("Worker database unavailable", { operation: error.operation }).pipe(
            Effect.andThen(Effect.sleep("3 seconds")),
          ),
        ),
      ),
    );

  const run = Effect.all(
    [
      lane(BookWorkflow.planningLane),
      lane(BookWorkflow.renderingLane),
      lane(BookWorkflow.renderingLane),
    ],
    {
      concurrency: "unbounded",
    },
  );

  return { tick, run };
});

export class Worker extends Context.Service<Worker, Effect.Success<typeof worker>>()(
  "imagine/Worker",
) {
  static readonly layer = Layer.effect(Worker, worker);
}
