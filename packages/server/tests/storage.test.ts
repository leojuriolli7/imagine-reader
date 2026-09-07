import { createServer } from "node:http";
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Fiber, Layer, Predicate } from "effect";
import { BlobStorage } from "../src/data/ports";
import { AppConfig } from "../src/infrastructure/config";
import { StorageLive } from "../src/infrastructure/storage/s3";

it.live("closes a stalled S3 response when the consumer is interrupted", () =>
  Effect.gen(function* () {
    let bodyStarted = false;
    let bodyClosed = false;
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createServer((_request, response) => {
          response.writeHead(200, {
            "content-type": "application/octet-stream",
            "content-length": 1000,
          });
          response.write(new Uint8Array([1, 2, 3]));
          bodyStarted = true;
          response.on("close", () => {
            bodyClosed = true;
          });
        }),
      ),
      (server) =>
        Effect.sync(() => {
          server.closeAllConnections();
          server.close();
        }),
    );

    yield* Effect.promise<void>(
      () => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)),
    );
    const address = server.address();
    if (!address || Predicate.isString(address)) return yield* Effect.die("Expected a TCP address");

    const config = ConfigProvider.fromUnknown({
      DATABASE_URL: "postgres://user:password@localhost/db",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "a".repeat(32),
      SMTP_URL: "smtp://localhost:1025",
      S3_BUCKET: "books",
      AI_MODE: "demo",
      S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
      S3_FORCE_PATH_STYLE: "true",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
    });
    const live = StorageLive.pipe(
      Layer.provide(AppConfig.layer),
      Layer.provide(Layer.succeed(ConfigProvider.ConfigProvider, config)),
    );

    yield* Effect.gen(function* () {
      const storage = yield* BlobStorage;
      const fiber = yield* Effect.forkChild(storage.get("stalled"));
      yield* Effect.sleep("10 millis").pipe(Effect.repeat({ while: () => !bodyStarted }));
      yield* Fiber.interrupt(fiber);
      yield* Effect.sleep("10 millis").pipe(Effect.repeat({ while: () => !bodyClosed }));
      assert.isTrue(bodyClosed);
    }).pipe(Effect.provide(live), Effect.timeout("5 seconds"));
  }),
);
