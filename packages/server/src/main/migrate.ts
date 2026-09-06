import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { PgClient, PgMigrator } from "@effect/sql-pg";
import { Effect, Layer, Redacted } from "effect";
import { databaseConfig } from "../infrastructure/config";

import { migrations } from "../infrastructure/db/migrations";

const Database = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* databaseConfig;

    return PgClient.layer({ url: Redacted.make(config.url) });
  }),
);

PgMigrator.run({ loader: migrations }).pipe(
  Effect.tap(() => Effect.logInfo("Database migrations applied.")),
  Effect.provide(Database),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
