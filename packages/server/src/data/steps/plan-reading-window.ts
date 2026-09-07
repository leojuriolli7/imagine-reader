import type { DatabaseError, ProviderError, InvalidPlan } from "../../domain/errors";
import { Conflict, type NotFound, type InvalidInput } from "@imagine/contracts/errors";
import { Clock, Context, Effect, Layer } from "effect";
import { BookWorkflow } from "../../domain/book-workflow";
import { PlanningWindow } from "../../domain/planning-window";
import { BookRepository, Illustrations } from "../ports";
import type { BookStep } from "./book-step";

export class PlanReadingWindow extends Context.Service<
  PlanReadingWindow,
  BookStep<DatabaseError | ProviderError | InvalidPlan | Conflict | NotFound | InvalidInput>
>()("imagine/PlanReadingWindow") {
  static readonly layer = Layer.effect(
    PlanReadingWindow,
    Effect.gen(function* () {
      const books = yield* BookRepository;
      const ai = yield* Illustrations;

      return PlanReadingWindow.of({
        execute: Effect.fn("PlanReadingWindow.execute")(function* (job, book) {
          const start = Number(job.ref);

          if (book.plannedThrough >= start) return;
          if (start !== book.plannedThrough + 1)
            return yield* new Conflict({ message: "Planning checkpoint changed." });

          const window = yield* PlanningWindow.open(book, job.feedback);
          const began = yield* Clock.currentTimeMillis;
          const proposal = yield* ai.plan(window.input, book.config);
          const result = yield* window.compile(proposal);
          const finished = yield* Clock.currentTimeMillis;

          yield* books.change(
            book.id,
            Effect.fn("PlanReadingWindow.commit")(function* (current) {
              if (current.plannedThrough !== start - 1)
                return yield* new Conflict({ message: "Planning checkpoint changed." });

              const updated = {
                ...current,
                characters: result.characters,
                summary: result.summary,
                activeIllustrationId: result.activeIllustrationId,
                plannedThrough: window.input.end - 1,
                illustrations: [...current.illustrations, ...result.illustrations],
                spans: [...current.spans, ...result.spans],
                batches: [
                  ...current.batches,
                  {
                    start,
                    end: window.input.end,
                    sceneIds: result.illustrations.map((image) => image.id),
                    durationMs: finished - began,
                  },
                ],
              };

              return { book: updated, jobs: BookWorkflow.next(updated) };
            }),
            job,
          );
        }),
      });
    }),
  );
}
