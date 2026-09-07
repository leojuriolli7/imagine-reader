import type { InvalidInput, Conflict, NotFound } from "@imagine/contracts/errors";
import type { DatabaseError, StorageError } from "../../domain/errors";
import { Context, Effect, Layer } from "effect";
import { BookWorkflow } from "../../domain/book-workflow";
import { BlobStorage, BookRepository, Extractor } from "../ports";
import type { BookStep } from "./book-step";

export class ExtractBook extends Context.Service<
  ExtractBook,
  BookStep<DatabaseError | StorageError | Conflict | NotFound | InvalidInput>
>()("imagine/ExtractBook") {
  static readonly layer = Layer.effect(
    ExtractBook,
    Effect.gen(function* () {
      const books = yield* BookRepository;
      const storage = yield* BlobStorage;
      const extractor = yield* Extractor;

      return ExtractBook.of({
        execute: Effect.fn("ExtractBook.execute")(function* (job, book) {
          if (book.status === "ready") return;

          const result = yield* extractor.extract(yield* storage.get(book.storageKey));

          yield* books.change(
            book.id,
            (current) => {
              const updated = {
                ...current,
                ...result,
                status: "ready" as const,
                error: null,
                targetThrough: Math.min(current.targetThrough, result.pageCount),
              };

              return Effect.succeed({ book: updated, jobs: BookWorkflow.next(updated) });
            },
            job,
          );
        }),
      });
    }),
  );
}
