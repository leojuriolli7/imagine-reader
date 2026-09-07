import { readFileSync } from "node:fs";
import { PgMigrator } from "@effect/sql-pg";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

export const migrations = PgMigrator.fromRecord({
  "003_reading_workflow": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const source = yield* Effect.sync(() =>
      readFileSync(new URL("./migrations/003-reading-workflow.sql", import.meta.url), "utf8"),
    );

    yield* sql.unsafe(source).withoutTransform;
  }),
  "002_job_trace_context": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`ALTER TABLE jobs ADD COLUMN trace_context jsonb`;
  }),
  "001_initial": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const source = yield* Effect.sync(() =>
      readFileSync(new URL("./migrations/001-initial.sql", import.meta.url), "utf8"),
    );

    yield* sql.unsafe(source).withoutTransform;
  }),
});
