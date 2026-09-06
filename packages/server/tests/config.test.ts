import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Redacted } from "effect";
import { loadConfig } from "../src/infrastructure/config";

const environment = {
  DATABASE_URL: "postgres://user:password@localhost/db",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a".repeat(32),
  SMTP_URL: "smtp://localhost:1025",
  S3_BUCKET: "books",
  AI_MODE: "demo",
};

it.effect("loads defaults without AI credentials and parses false literally", () =>
  Effect.gen(function* () {
    const config = yield* loadConfig.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ ...environment, S3_FORCE_PATH_STYLE: "false" }),
      ),
    );

    assert.strictEqual(config.storage.forcePathStyle, false);

    assert.strictEqual(config.mode, "demo");

    assert.strictEqual(Redacted.value(config.openaiKey), "");
  }),
);

it.effect.each([
  { AI_MODE: "openai" },
  { BETTER_AUTH_URL: "http://localhost:3000/path" },
  { S3_ENDPOINT: "file:///tmp" },
  { AWS_ACCESS_KEY_ID: "key" },
  { DATABASE_URL: "http://localhost/db" },
  { S3_FORCE_PATH_STYLE: "wrong" },
])("rejects invalid environment %#", (override) =>
  Effect.gen(function* () {
    const result = yield* loadConfig.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ ...environment, ...override }),
      ),
      Effect.result,
    );

    assert.isTrue(result._tag === "Failure");
  }),
);
