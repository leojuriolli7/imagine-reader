import { Schema } from "effect";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  operation: Schema.String,
  reason: Schema.Literals([
    "connection",
    "access",
    "constraint",
    "query",
    "content",
    "timeout",
    "concurrency",
    "unknown",
  ]),
  retryable: Schema.Boolean,
  outcomeUnknown: Schema.Boolean,
  cause: Schema.Defect(),
}) {}

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  operation: Schema.String,
  reason: Schema.Literals([
    "connection",
    "access",
    "not-found",
    "throttled",
    "server",
    "invalid-response",
    "timeout",
    "unknown",
  ]),
  retryable: Schema.Boolean,
  cause: Schema.Defect(),
}) {}

export class ProviderError extends Schema.TaggedError<ProviderError>()("ProviderError", {
  message: Schema.String,
  retryable: Schema.Boolean,
  cause: Schema.Defect(),
}) {}

export class AuthenticationError extends Schema.TaggedError<AuthenticationError>()(
  "AuthenticationError",
  { cause: Schema.Defect() },
) {}

export class InvalidPlan extends Schema.TaggedError<InvalidPlan>()("InvalidPlan", {
  message: Schema.String,
}) {}
