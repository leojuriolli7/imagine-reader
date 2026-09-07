import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

const text = (key: string, fallback: string) =>
  Config.string(key).pipe(Config.withDefault(fallback));

const secret = (key: string) => Config.redacted(key).pipe(Config.withDefault(Redacted.make("")));

const url = (key: string, protocols: readonly string[]) =>
  Config.schema(
    Schema.String.check(
      Schema.makeFilter(
        (value) => URL.canParse(value) && protocols.includes(new URL(value).protocol),
      ),
    ),
    key,
  );

export const databaseConfig = Config.all({
  url: url("DATABASE_URL", ["postgres:", "postgresql:"]),
});

const storageConfig = Config.all({
  bucket: Config.schema(Schema.NonEmptyString, "S3_BUCKET"),
  endpoint: text("S3_ENDPOINT", ""),
  region: text("S3_REGION", "us-east-1"),
  forcePathStyle: Config.boolean("S3_FORCE_PATH_STYLE").pipe(Config.withDefault(false)),
  accessKey: secret("AWS_ACCESS_KEY_ID"),
  secretKey: secret("AWS_SECRET_ACCESS_KEY"),
  sessionToken: secret("AWS_SESSION_TOKEN"),
});

const appConfig = Config.all({
  database: databaseConfig,
  storage: storageConfig,
  origin: url("BETTER_AUTH_URL", ["http:", "https:"]),
  authSecret: Config.schema(Schema.String.check(Schema.isMinLength(32)), "BETTER_AUTH_SECRET").pipe(
    Config.map(Redacted.make),
  ),
  smtpUrl: url("SMTP_URL", ["smtp:", "smtps:"]),
  emailFrom: text("EMAIL_FROM", "ImagineReader <reader@imagine.local>"),
  mode: Config.schema(Schema.Literals(["demo", "openai"]), "AI_MODE").pipe(
    Config.withDefault("demo"),
  ),
  openaiKey: secret("OPENAI_API_KEY"),
  plannerModel: text("PLANNER_MODEL", "gpt-4.1-mini"),
  imageModel: text("IMAGE_MODEL", "gpt-image-2"),
  otelServiceName: text("OTEL_SERVICE_NAME", "imagine-reader"),
  otlpEndpoint: text("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
  nodeEnv: Config.schema(Schema.Literals(["development", "test", "production"]), "NODE_ENV").pipe(
    Config.withDefault("development"),
  ),
  port: Config.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
    "PORT",
  ).pipe(Config.withDefault(3000)),
});

class ConfigurationError extends Schema.TaggedError<ConfigurationError>()("ConfigurationError", {
  message: Schema.String,
}) {}

export const loadConfig = Effect.gen(function* () {
  const value = yield* appConfig;

  if (new URL(value.origin).origin !== value.origin)
    return yield* new ConfigurationError({
      message: "BETTER_AUTH_URL must be an origin without a path or trailing slash.",
    });

  if (value.mode === "openai" && Redacted.value(value.openaiKey).length === 0)
    return yield* new ConfigurationError({ message: "OPENAI_API_KEY is required in openai mode." });

  if (
    value.storage.endpoint &&
    (!URL.canParse(value.storage.endpoint) ||
      !["http:", "https:"].includes(new URL(value.storage.endpoint).protocol))
  )
    return yield* new ConfigurationError({ message: "S3_ENDPOINT must be an HTTP URL." });

  if (
    Boolean(Redacted.value(value.storage.accessKey)) !==
    Boolean(Redacted.value(value.storage.secretKey))
  )
    return yield* new ConfigurationError({
      message: "AWS access and secret keys must be supplied together.",
    });

  if (Redacted.value(value.storage.sessionToken) && !Redacted.value(value.storage.accessKey))
    return yield* new ConfigurationError({
      message: "AWS_SESSION_TOKEN requires static credentials.",
    });

  if (
    value.otlpEndpoint &&
    (!URL.canParse(value.otlpEndpoint) ||
      !["http:", "https:"].includes(new URL(value.otlpEndpoint).protocol))
  )
    return yield* new ConfigurationError({
      message: "OTEL_EXPORTER_OTLP_ENDPOINT must be an HTTP URL.",
    });

  return value;
});

export class AppConfig extends Context.Service<AppConfig, Effect.Success<typeof loadConfig>>()(
  "imagine/AppConfig",
) {
  static readonly layer = Layer.effect(AppConfig, loadConfig);
}
