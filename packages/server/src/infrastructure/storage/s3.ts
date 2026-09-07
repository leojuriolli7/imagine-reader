import { storageFailure } from "./failure";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Effect, Layer, Redacted, Schema, Stream } from "effect";
import { BlobStorage } from "../../data/ports";
import { StorageError } from "../../domain/errors";
import { AppConfig } from "../config";

export const StorageLive = Layer.effect(
  BlobStorage,
  Effect.gen(function* () {
    const { storage } = yield* AppConfig;

    const client = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new S3Client({
            endpoint: storage.endpoint || undefined,
            region: storage.region,
            forcePathStyle: storage.forcePathStyle,
            maxAttempts: 1,
            requestHandler: { requestTimeout: 30000 },
            credentials: Redacted.value(storage.accessKey)
              ? {
                  accessKeyId: Redacted.value(storage.accessKey),
                  secretAccessKey: Redacted.value(storage.secretKey),
                  sessionToken: Redacted.value(storage.sessionToken) || undefined,
                }
              : undefined,
          }),
      ),
      (client) => Effect.sync(() => client.destroy()),
    );

    return BlobStorage.of({
      put: Effect.fn("Storage.put")((key, bytes, mediaType) =>
        Effect.tryPromise({
          try: (signal) =>
            client.send(
              new PutObjectCommand({
                Bucket: storage.bucket,
                Key: key,
                Body: bytes,
                ContentType: mediaType,
              }),
              { abortSignal: signal },
            ),
          catch: storageFailure("put"),
        }).pipe(Effect.asVoid),
      ),
      get: Effect.fn("Storage.get")((key) =>
        Effect.scoped(
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const stream = yield* Effect.acquireRelease(
                Effect.gen(function* () {
                  const response = yield* restore(
                    Effect.tryPromise({
                      try: (signal) =>
                        client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key }), {
                          abortSignal: signal,
                        }),
                      catch: storageFailure("get"),
                    }),
                  );

                  const body = response.Body;

                  if (!body)
                    return yield* new StorageError({
                      operation: "get",
                      cause: "Missing body",
                      reason: "invalid-response",
                      retryable: true,
                    });

                  return yield* Effect.try({
                    try: () => body.transformToWebStream(),
                    catch: storageFailure("read"),
                  });
                }),
                (stream) =>
                  Effect.tryPromise({
                    try: () => stream.cancel(),
                    catch: storageFailure("close"),
                  }).pipe(
                    Effect.interruptible,
                    Effect.timeout("5 seconds"),
                    Effect.catchCause((cause) =>
                      Effect.logWarning("S3 body cleanup failed", cause),
                    ),
                  ),
              );

              const chunks = yield* restore(
                Stream.fromReadableStream({
                  evaluate: () => stream,
                  onError: storageFailure("read"),
                  releaseLockOnEnd: true,
                }).pipe(
                  Stream.mapEffect((chunk) =>
                    Schema.decodeUnknownEffect(Schema.Uint8Array)(chunk).pipe(
                      Effect.mapError(
                        (cause) =>
                          new StorageError({
                            operation: "read",
                            cause,
                            reason: "invalid-response",
                            retryable: true,
                          }),
                      ),
                    ),
                  ),
                  Stream.runCollect,
                  Effect.timeout("30 seconds"),
                  Effect.catchTag("TimeoutError", (cause) =>
                    Effect.fail(storageFailure("read")(cause)),
                  ),
                ),
              );

              const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
              let offset = 0;

              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
              }

              return bytes;
            }),
          ),
        ),
      ),
      remove: Effect.fn("Storage.remove")((key) =>
        Effect.tryPromise({
          try: (signal) =>
            client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }), {
              abortSignal: signal,
            }),
          catch: storageFailure("remove"),
        }).pipe(Effect.asVoid),
      ),
      check: Effect.tryPromise({
        try: (signal) =>
          client.send(new HeadBucketCommand({ Bucket: storage.bucket }), { abortSignal: signal }),
        catch: storageFailure("check bucket"),
      }).pipe(Effect.asVoid),
    });
  }),
);
