import { Schema } from "effect";
import { StorageError } from "../../domain/errors";

const Failure = Schema.Struct({
  name: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  $metadata: Schema.optional(Schema.Struct({ httpStatusCode: Schema.optional(Schema.Number) })),
});

export const storageFailure =
  (operation: string) =>
  (cause: unknown): StorageError => {
    const details = Schema.decodeUnknownOption(Failure)(cause);
    const value = details._tag === "Some" ? details.value : undefined;
    const status = value?.$metadata?.httpStatusCode;
    const name = value?.code ?? value?.name;

    if (status === 401 || status === 403 || name === "CredentialsProviderError")
      return new StorageError({ operation, cause, reason: "access", retryable: false });
    if (status === 404)
      return new StorageError({ operation, cause, reason: "not-found", retryable: false });
    if (status === 429 || name === "SlowDown")
      return new StorageError({ operation, cause, reason: "throttled", retryable: true });
    if (status && status >= 500)
      return new StorageError({ operation, cause, reason: "server", retryable: true });
    if (name && ["TimeoutError", "ETIMEDOUT", "RequestTimeout"].includes(name))
      return new StorageError({ operation, cause, reason: "timeout", retryable: true });
    if (
      name &&
      ["ECONNRESET", "ECONNREFUSED", "EPIPE", "EAI_AGAIN", "NetworkingError"].includes(name)
    )
      return new StorageError({ operation, cause, reason: "connection", retryable: true });

    return new StorageError({ operation, cause, reason: "unknown", retryable: false });
  };
