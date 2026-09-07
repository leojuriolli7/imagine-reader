import { assert, it } from "@effect/vitest";
import { SqlError } from "effect/unstable/sql";
import { databaseFailure } from "../src/infrastructure/db/failure";
import { storageFailure } from "../src/infrastructure/storage/failure";

it.each([
  { cause: { $metadata: { httpStatusCode: 403 } }, retryable: false, reason: "access" },
  { cause: { $metadata: { httpStatusCode: 404 } }, retryable: false, reason: "not-found" },
  { cause: { $metadata: { httpStatusCode: 503 } }, retryable: true, reason: "server" },
  { cause: { code: "ECONNRESET" }, retryable: true, reason: "connection" },
])("classifies storage failures %#", ({ cause, retryable, reason }) => {
  const error = storageFailure("get")(cause);
  assert.strictEqual(error.retryable, retryable);
  assert.strictEqual(error.reason, reason);
});

it.each([
  {
    reason: new SqlError.SqlSyntaxError({
      message: "Invalid SQL",
      operation: "query",
      cause: "syntax",
    }),
    retryable: false,
  },
  {
    reason: new SqlError.ConnectionError({
      message: "Connection lost",
      operation: "query",
      cause: "network",
    }),
    retryable: true,
  },
])("preserves the SQL retry decision %#", ({ reason, retryable }) => {
  const error = databaseFailure("query")(new SqlError.SqlError({ reason }));
  assert.strictEqual(error.retryable, retryable);
});
