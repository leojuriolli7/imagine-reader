import { assert, it } from "@effect/vitest";
import { Conflict } from "@imagine/contracts/errors";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { ObjectPublication } from "../src/data/object-publication";
import { BlobStorage } from "../src/data/ports";
import { DatabaseError } from "../src/domain/errors";

const object = { key: "test/object", bytes: new Uint8Array([1]), mediaType: "image/png" };

const storageLayer = (put: Effect.Effect<void>, remove: Effect.Effect<void>) =>
  Layer.succeed(
    BlobStorage,
    BlobStorage.of({
      put: () => put,
      remove: () => remove,
      get: () => Effect.succeed(object.bytes),
      check: Effect.void,
    }),
  );

it.effect("cancels an upload and compensates without starting the commit", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const cancelled = yield* Ref.make(false);
    const removed = yield* Ref.make(false);
    const committed = yield* Ref.make(false);
    const storage = storageLayer(
      Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Ref.set(cancelled, true)),
      ),
      Ref.set(removed, true),
    );
    const program = Effect.gen(function* () {
      const publication = yield* ObjectPublication;
      yield* publication.publish(object, Ref.set(committed, true));
    }).pipe(Effect.provide(ObjectPublication.layer.pipe(Layer.provide(storage))));

    const fiber = yield* Effect.forkChild(program);
    yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);

    assert.isTrue(yield* Ref.get(cancelled));
    assert.isTrue(yield* Ref.get(removed));
    assert.isFalse(yield* Ref.get(committed));
  }),
);

it.effect.each([
  { error: new Conflict({ message: "Lease expired" }), remove: true },
  {
    error: new DatabaseError({
      operation: "commit",
      reason: "connection",
      retryable: true,
      outcomeUnknown: true,
      cause: "Connection lost after COMMIT",
    }),
    remove: false,
  },
])("compensates only a known failed commit %#", ({ error, remove }) =>
  Effect.gen(function* () {
    const removed = yield* Ref.make(false);
    const storage = storageLayer(Effect.void, Ref.set(removed, true));

    yield* Effect.gen(function* () {
      const publication = yield* ObjectPublication;
      yield* publication.publish(object, Effect.fail(error)).pipe(Effect.flip);
    }).pipe(Effect.provide(ObjectPublication.layer.pipe(Layer.provide(storage))));

    assert.strictEqual(yield* Ref.get(removed), remove);
  }),
);

it.effect("retains the object when cancellation races a commit", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const removed = yield* Ref.make(false);
    const storage = storageLayer(Effect.void, Ref.set(removed, true));
    const program = Effect.gen(function* () {
      const publication = yield* ObjectPublication;
      yield* publication.publish(
        object,
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
      );
    }).pipe(Effect.provide(ObjectPublication.layer.pipe(Layer.provide(storage))));

    const fiber = yield* Effect.forkChild(program);
    yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);

    assert.isFalse(yield* Ref.get(removed));
  }),
);
