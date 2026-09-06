import { Conflict, InvalidInput, NotFound } from "@imagine/contracts/errors";
import type { Book, Job, Plan } from "@imagine/contracts/models";
import { Clock, Context, Effect, Layer } from "effect";
import { ProviderError } from "../domain/errors";
import { prepareBatch, validatePlan } from "../domain/planning";
import { planJob, renderJobs } from "../domain/scheduling";
import { BlobStorage, BookRepository, Extractor, Illustrations } from "./ports";

const pipeline = Effect.gen(function* () {
  const books = yield* BookRepository;

  const storage = yield* BlobStorage;

  const extractor = yield* Extractor;

  const ai = yield* Illustrations;

  const extract = Effect.fn("Pipeline.extract")(function* (job: Job, book: Book) {
    if (book.status === "ready") return;

    const bytes = yield* storage.get(book.storageKey);

    const result = yield* extractor.extract(bytes);

    yield* books.change(
      book.id,
      (current) => {
        const updated: Book = {
          ...current,
          ...result,
          status: "ready",
          error: null,
          targetThrough: Math.min(current.targetThrough, result.pageCount),
        };

        return Effect.succeed({ book: updated, jobs: planJob(updated) });
      },
      job,
    );
  });

  const plan = Effect.fn("Pipeline.plan")(function* (job: Job, book: Book) {
    const start = Number(job.ref);

    if (book.plannedThrough >= start) return;

    if (start !== book.plannedThrough + 1)
      return yield* new Conflict({ message: "Planning checkpoint changed." });

    const input = yield* prepareBatch(
      book.passages,
      start,
      book.targetThrough,
      book.checkpoint,
      book.illustrations,
      book.config.style,
    );

    const began = yield* Clock.currentTimeMillis;

    const generated = yield* ai.plan(input, book.config);

    const result = resolveIds(
      yield* validatePlan(generated, input).pipe(
        Effect.mapError(
          (cause) => new ProviderError({ message: cause.message, retryable: true, cause }),
        ),
      ),
      `${book.id}:${start}`,
    );

    const finished = yield* Clock.currentTimeMillis;

    yield* books.change(
      book.id,
      Effect.fn(function* (current) {
        if (current.plannedThrough !== start - 1)
          return yield* new Conflict({ message: "Planning checkpoint changed." });

        const updated: Book = {
          ...current,
          plannedThrough: input.end - 1,
          checkpoint: result.checkpoint,
          batches: [
            ...current.batches,
            { start, end: input.end, plan: result, durationMs: finished - began },
          ],
          illustrations: [
            ...current.illustrations,
            ...result.illustrations.map((i) => ({ ...i, artifact: null })),
          ],
        };

        return { book: updated, jobs: [...planJob(updated), ...renderJobs(updated)] };
      }),
      job,
    );
  });

  const render = Effect.fn("Pipeline.render")(function* (job: Job, book: Book) {
    const illustration = book.illustrations.find((i) => i.id === job.ref);

    if (!illustration) return yield* new InvalidInput({ message: "Unknown illustration." });

    if (illustration.artifact) return;

    const result = yield* ai.render(`${book.config.style}\n${illustration.prompt}`, book.config);

    const key = `books/${book.id}/images/${job.id}-${job.token}`;

    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        yield* storage.put(key, result.bytes, result.mediaType);

        yield* books
          .change(
            book.id,
            Effect.fn(function* (current) {
              if (!current.illustrations.some((i) => i.id === job.ref))
                return yield* new Conflict({ message: "Illustration changed." });

              return {
                book: {
                  ...current,
                  illustrations: current.illustrations.map((i) =>
                    i.id === job.ref
                      ? {
                          ...i,
                          artifact: { key, mediaType: result.mediaType, model: result.model },
                        }
                      : i,
                  ),
                },
                jobs: [],
              };
            }),
            job,
          )
          .pipe(
            Effect.onError(() =>
              storage
                .remove(key)
                .pipe(Effect.catch((cause) => Effect.logError("Image compensation failed", cause))),
            ),
          );
      }),
    );
  });

  const handlers = { extract, plan, render };

  const run = Effect.fn("Pipeline.run")(function* (job: Job) {
    const book = yield* books.get(job.bookId);

    if (!book) return yield* new NotFound({ message: "Book not found." });

    yield* handlers[job.kind](job, book);
  });

  return { run };
});

export class Pipeline extends Context.Service<Pipeline, Effect.Success<typeof pipeline>>()(
  "imagine/Pipeline",
) {
  static readonly layer = Layer.effect(Pipeline, pipeline);
}

function resolveIds(plan: Plan, prefix: string): Plan {
  const ids = new Map(plan.illustrations.map((i, index) => [i.id, `${prefix}:${index}`]));

  const resolve = (id: string | null) => (id === null ? null : (ids.get(id) ?? id));

  return {
    illustrations: plan.illustrations.map((i, index) => ({ ...i, id: `${prefix}:${index}` })),
    spans: plan.spans.map((s) => ({ ...s, illustrationId: resolve(s.illustrationId) })),
    checkpoint: {
      ...plan.checkpoint,
      activeIllustrationId: resolve(plan.checkpoint.activeIllustrationId),
    },
  };
}
