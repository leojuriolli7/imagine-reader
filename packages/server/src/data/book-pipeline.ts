import { NotFound } from "@imagine/contracts/errors";
import type { Job, JobKind } from "@imagine/contracts/models";
import { Context, Effect, Layer } from "effect";
import { BookRepository } from "./ports";
import { ExtractBook } from "./steps/extract-book";
import { EstablishArtDirection } from "./steps/establish-art-direction";
import { PlanReadingWindow } from "./steps/plan-reading-window";
import { RenderIllustration } from "./steps/render-illustration";

import type { BookStep } from "./steps/book-step";

type PipelineFailure = Effect.Error<
  ReturnType<
    | ExtractBook["Service"]["execute"]
    | EstablishArtDirection["Service"]["execute"]
    | PlanReadingWindow["Service"]["execute"]
    | RenderIllustration["Service"]["execute"]
  >
>;

/** Exhaustive dispatch makes adding a durable step a compiler-checked change. */
export class BookPipeline extends Context.Service<
  BookPipeline,
  {
    run(job: Job): Effect.Effect<void, PipelineFailure>;
  }
>()("imagine/BookPipeline") {
  static readonly layer = Layer.effect(
    BookPipeline,
    Effect.gen(function* () {
      const books = yield* BookRepository;
      const steps = {
        extract: yield* ExtractBook,
        "art-direction": yield* EstablishArtDirection,
        plan: yield* PlanReadingWindow,
        render: yield* RenderIllustration,
      } satisfies Record<JobKind, BookStep<PipelineFailure>>;

      return BookPipeline.of({
        run: Effect.fn("BookPipeline.run")(function* (job) {
          const book = yield* books.get(job.bookId);

          if (!book) return yield* new NotFound({ message: "Book not found." });

          yield* steps[job.kind].execute(job, book);
        }),
      });
    }),
  );
}
