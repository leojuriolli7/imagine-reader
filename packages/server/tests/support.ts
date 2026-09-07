import { randomUUID } from "node:crypto";
import { NodeServices } from "@effect/platform-node";
import { PgClient, PgMigrator } from "@effect/sql-pg";
import { Config, ConfigProvider, Effect, Layer, Redacted, Schema } from "effect";
import { BlobStorage, BookRepository } from "../src/data/ports";
import { migrations } from "../src/infrastructure/db/migrations";
import { AppLive } from "../src/main/runtime";

export const testOwner = randomUUID();

export const testEmail = `effect-${randomUUID()}@example.com`;

const testSettings = Config.all({
  telemetry: Config.string("TEST_OTEL_EXPORTER_OTLP_ENDPOINT").pipe(Config.withDefault("")),
  database: Config.schema(
    Schema.String.check(
      Schema.makeFilter(
        (value) => URL.canParse(value) && /^\/[a-z_]+_test$/.test(new URL(value).pathname),
      ),
    ),
    "TEST_DATABASE_URL",
  ).pipe(
    Config.withDefault("postgres://imagine:imagine_local@localhost:55432/imagine_reader_test"),
  ),
  smtp: Config.string("TEST_SMTP_URL").pipe(Config.withDefault("smtp://localhost:51025")),
  endpoint: Config.string("TEST_S3_ENDPOINT").pipe(Config.withDefault("http://localhost:58333")),
  bucket: Config.string("TEST_S3_BUCKET").pipe(Config.withDefault("imagine-reader-test")),
  accessKey: Config.string("TEST_S3_ACCESS_KEY_ID").pipe(Config.withDefault("imagine-local")),
  secretKey: Config.string("TEST_S3_SECRET_ACCESS_KEY").pipe(
    Config.withDefault("imagine-local-secret"),
  ),
});

export const TestApp = Layer.unwrap(
  Effect.gen(function* () {
    const settings = yield* testSettings;

    const target = new URL(settings.database);

    const name = target.pathname.slice(1);

    target.pathname = "/postgres";

    yield* Effect.scoped(
      Effect.gen(function* () {
        const sql = yield* PgClient.PgClient;

        const rows = yield* sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;

        if (rows.length === 0) yield* sql.unsafe(`CREATE DATABASE "${name}"`);
      }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(target.toString()) }))),
    );

    yield* PgMigrator.run({ loader: migrations }).pipe(
      Effect.provide(PgClient.layer({ url: Redacted.make(settings.database) })),
      Effect.provide(NodeServices.layer),
    );

    const provider = ConfigProvider.fromUnknown({
      DATABASE_URL: settings.database,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
      SMTP_URL: settings.smtp,
      S3_ENDPOINT: settings.endpoint,
      S3_BUCKET: settings.bucket,
      S3_FORCE_PATH_STYLE: "true",
      AWS_ACCESS_KEY_ID: settings.accessKey,
      AWS_SECRET_ACCESS_KEY: settings.secretKey,
      AI_MODE: "demo",
      OTEL_EXPORTER_OTLP_ENDPOINT: settings.telemetry,
      OTEL_SERVICE_NAME: "imagine-reader-tests",
    });

    const services = Layer.mergeAll(
      AppLive,
      PgClient.layer({ url: Redacted.make(settings.database) }),
    ).pipe(Layer.provide(Layer.succeed(ConfigProvider.ConfigProvider, provider)));

    const cleanup = Layer.effectDiscard(
      Effect.gen(function* () {
        const books = yield* BookRepository;

        const storage = yield* BlobStorage;

        const sql = yield* PgClient.PgClient;

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            for (const book of yield* books.list(testOwner)) {
              yield* storage.remove(book.storageKey);

              for (const image of book.illustrations)
                if (image.artifact) yield* storage.remove(image.artifact.key);
            }

            yield* sql`DELETE FROM books WHERE owner_id = ${testOwner}`;

            yield* sql`DELETE FROM "user" WHERE email = ${testEmail}`;
          }).pipe(Effect.orDie),
        );
      }),
    );

    return cleanup.pipe(Layer.provideMerge(services));
  }),
);
