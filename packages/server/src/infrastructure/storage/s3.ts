import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Effect, Layer, Redacted } from "effect";
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
          catch: (cause) => new StorageError({ operation: "put", cause }),
        }).pipe(Effect.asVoid),
      ),
      get: Effect.fn("Storage.get")(function* (key) {
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key }), {
              abortSignal: signal,
            }),
          catch: (cause) => new StorageError({ operation: "get", cause }),
        });

        const body = response.Body;

        if (!body) return yield* new StorageError({ operation: "get", cause: "Missing body" });

        return yield* Effect.tryPromise({
          try: () => body.transformToByteArray(),
          catch: (cause) => new StorageError({ operation: "read", cause }),
        });
      }),
      remove: Effect.fn("Storage.remove")((key) =>
        Effect.tryPromise({
          try: (signal) =>
            client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }), {
              abortSignal: signal,
            }),
          catch: (cause) => new StorageError({ operation: "remove", cause }),
        }).pipe(Effect.asVoid),
      ),
      check: Effect.tryPromise({
        try: (signal) =>
          client.send(new HeadBucketCommand({ Bucket: storage.bucket }), { abortSignal: signal }),
        catch: (cause) => new StorageError({ operation: "check bucket", cause }),
      }).pipe(Effect.asVoid),
    });
  }),
);
