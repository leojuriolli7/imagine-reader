import type { Conflict, InvalidInput, NotFound } from "@imagine/contracts/errors";
import { Cause, Context, Effect, Exit, Layer, Option } from "effect";
import type { DatabaseError, StorageError } from "../domain/errors";
import { BlobStorage } from "./ports";

type CommitFailure = DatabaseError | Conflict | InvalidInput | NotFound;

interface ObjectContent {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

/** Owns publication compensation without masking network I/O or deleting an uncertain commit. */
export class ObjectPublication extends Context.Service<
  ObjectPublication,
  {
    publish<E extends CommitFailure, R>(
      object: ObjectContent,
      commit: Effect.Effect<void, E, R>,
    ): Effect.Effect<void, E | StorageError, R>;
  }
>()("imagine/ObjectPublication") {
  static readonly layer = Layer.effect(
    ObjectPublication,
    Effect.gen(function* () {
      const storage = yield* BlobStorage;

      const remove = Effect.fn("ObjectPublication.compensate")((key: string) =>
        storage.remove(key).pipe(
          Effect.interruptible,
          Effect.timeout("5 seconds"),
          Effect.catchCause((cause) =>
            Effect.logError("Object compensation failed", { key, cause }),
          ),
        ),
      );

      return ObjectPublication.of({
        publish: Effect.fn("ObjectPublication.publish")(function* <E extends CommitFailure, R>(
          object: ObjectContent,
          commit: Effect.Effect<void, E, R>,
        ) {
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const upload = yield* Effect.exit(
                restore(storage.put(object.key, object.bytes, object.mediaType)),
              );

              if (Exit.isFailure(upload)) {
                yield* remove(object.key);
                return yield* Effect.failCause(upload.cause);
              }

              const result = yield* Effect.exit(restore(commit));

              if (Exit.isSuccess(result)) return;

              const failure = Cause.findErrorOption(result.cause);
              const rolledBack =
                Option.isSome(failure) &&
                !Cause.hasDies(result.cause) &&
                !Cause.hasInterrupts(result.cause) &&
                !(failure.value._tag === "DatabaseError" && failure.value.outcomeUnknown);

              if (rolledBack) yield* remove(object.key);
              else
                yield* Effect.logWarning("Object retained because commit outcome is uncertain", {
                  key: object.key,
                });

              return yield* Effect.failCause(result.cause);
            }),
          );
        }),
      });
    }),
  );
}
