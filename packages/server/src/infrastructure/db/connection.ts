import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Redacted } from "effect";
import { AppConfig } from "../config";

export const DatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    return PgClient.layer({ url: Redacted.make(config.database.url), maxConnections: 10 });
  }),
);
