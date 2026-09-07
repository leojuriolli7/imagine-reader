import { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import { Pool } from "pg";
import { AppConfig } from "../config";

/** Server and client deadlines also bound transaction finalizers during shutdown. */
export const DatabaseLive = PgClient.layerFrom(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    return yield* PgClient.fromPool({
      acquire: Effect.acquireRelease(
        Effect.sync(
          () =>
            new Pool({
              connectionString: config.database.url,
              max: 10,
              connectionTimeoutMillis: 5000,
              statement_timeout: 15000,
              lock_timeout: 5000,
              idle_in_transaction_session_timeout: 15000,
              query_timeout: 20000,
            }),
        ),
        (pool) =>
          Effect.promise(() => pool.end()).pipe(
            Effect.interruptible,
            Effect.timeoutOption("5 seconds"),
            Effect.asVoid,
          ),
      ),
    });
  }),
);
