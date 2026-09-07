import type { DatabaseError, ProviderError } from "../../domain/errors";
import { Conflict, type NotFound } from "@imagine/contracts/errors";
import { Context, Effect, Layer } from "effect";
import { BookWorkflow } from "../../domain/book-workflow";
import { BookRepository, Illustrations } from "../ports";
import type { BookStep } from "./book-step";

export class EstablishArtDirection extends Context.Service<
  EstablishArtDirection,
  BookStep<DatabaseError | ProviderError | Conflict | NotFound>
>()("imagine/EstablishArtDirection") {
  static readonly layer = Layer.effect(
    EstablishArtDirection,
    Effect.gen(function* () {
      const books = yield* BookRepository;
      const ai = yield* Illustrations;

      return EstablishArtDirection.of({
        execute: Effect.fn("EstablishArtDirection.execute")(function* (job, book) {
          if (book.artDirection) return;
          if (book.status !== "ready")
            return yield* new Conflict({ message: "Text extraction is not ready." });

          let remaining = 24000;
          const pages = book.pages
            .slice(0, 12)
            .map((page) => {
              const text = page.text.slice(0, remaining);
              remaining -= text.length;
              return { page: page.page, text };
            })
            .filter((page) => page.text.length > 0);
          const artDirection = yield* ai.direct({ title: book.title, pages }, book.config);

          yield* books.change(
            book.id,
            (current) => {
              const updated = { ...current, artDirection: current.artDirection ?? artDirection };

              return Effect.succeed({ book: updated, jobs: BookWorkflow.next(updated) });
            },
            job,
          );
        }),
      });
    }),
  );
}
