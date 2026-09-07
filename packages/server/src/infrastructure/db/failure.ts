import { Match, Schema } from "effect";
import { SqlError } from "effect/unstable/sql";
import { DatabaseError } from "../../domain/errors";

export const databaseFailure =
  (operation: string) =>
  (cause: SqlError.SqlError | Schema.SchemaError): DatabaseError => {
    if (cause._tag === "SchemaError")
      return new DatabaseError({
        operation,
        cause,
        reason: "content",
        retryable: false,
        outcomeUnknown: false,
      });

    const reason = Match.value(cause.reason).pipe(
      Match.tags({
        ConnectionError: () => "connection" as const,
        AuthenticationError: () => "access" as const,
        AuthorizationError: () => "access" as const,
        SqlSyntaxError: () => "query" as const,
        UniqueViolation: () => "constraint" as const,
        ConstraintError: () => "constraint" as const,
        DeadlockError: () => "concurrency" as const,
        SerializationError: () => "concurrency" as const,
        LockTimeoutError: () => "timeout" as const,
        StatementTimeoutError: () => "timeout" as const,
        UnknownError: () => "unknown" as const,
      }),
      Match.exhaustive,
    );

    return new DatabaseError({
      operation,
      cause,
      reason,
      retryable: cause.isRetryable,
      outcomeUnknown: false,
    });
  };
