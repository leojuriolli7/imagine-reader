import { ObjectPublication } from "../object-publication";
import type { DatabaseError, StorageError, ProviderError } from "../../domain/errors";
import { Conflict, InvalidInput, type NotFound } from "@imagine/contracts/errors";
import { Context, Effect, Layer } from "effect";
import { BookRepository, Illustrations } from "../ports";
import type { BookStep } from "./book-step";

export class RenderIllustration extends Context.Service<
  RenderIllustration,
  BookStep<DatabaseError | StorageError | ProviderError | Conflict | NotFound | InvalidInput>
>()("imagine/RenderIllustration") {
  static readonly layer = Layer.effect(
    RenderIllustration,
    Effect.gen(function* () {
      const books = yield* BookRepository;
      const publication = yield* ObjectPublication;
      const ai = yield* Illustrations;

      return RenderIllustration.of({
        execute: Effect.fn("RenderIllustration.execute")(function* (job, book) {
          const illustration = book.illustrations.find((image) => image.id === job.ref);

          if (!illustration) return yield* new InvalidInput({ message: "Unknown illustration." });
          if (illustration.artifact) return;

          const result = yield* ai.render(illustration.prompt, book.config);
          const key = `books/${book.id}/images/${job.id}-${job.token}`;

          yield* publication.publish(
            { key, bytes: result.bytes, mediaType: result.mediaType },
            books.change(
              book.id,
              Effect.fn("RenderIllustration.commit")(function* (current) {
                if (!current.illustrations.some((image) => image.id === job.ref))
                  return yield* new Conflict({ message: "Illustration changed." });

                return {
                  book: {
                    ...current,
                    illustrations: current.illustrations.map((image) =>
                      image.id === job.ref
                        ? {
                            ...image,
                            artifact: { key, mediaType: result.mediaType, model: result.model },
                          }
                        : image,
                    ),
                  },
                  jobs: [],
                };
              }),
              job,
            ),
          );
        }),
      });
    }),
  );
}
