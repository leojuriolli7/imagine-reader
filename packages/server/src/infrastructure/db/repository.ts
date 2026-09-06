import { randomUUID } from "node:crypto";
import { PgClient } from "@effect/sql-pg";
import { Conflict, NotFound } from "@imagine/contracts/errors";
import { Book, Job, type JobSpec, JobStatus } from "@imagine/contracts/models";
import { Effect, Layer, Schema } from "effect";
import { BookRepository, JobQueue } from "../../data/ports";
import { DatabaseError } from "../../domain/errors";

const StateRow = Schema.Struct({ state: Book });

const decodeStates = Schema.decodeUnknownEffect(Schema.Array(StateRow));

const decodeJobs = Schema.decodeUnknownEffect(Schema.Array(Job));

const decodeStatus = Schema.decodeUnknownEffect(Schema.Array(JobStatus));

const databaseFailure = (operation: string) => (cause: unknown) =>
  new DatabaseError({ operation, cause });

export const RepositoryLive = Layer.effect(
  BookRepository,
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;

    const enqueue = Effect.fn("Outbox.enqueue")(function* (specs: readonly JobSpec[]) {
      const trace = yield* Effect.currentSpan.pipe(
        Effect.map(({ traceId, spanId, sampled }) => ({ traceId, spanId, sampled })),
        Effect.catchTag("NoSuchElementError", () => Effect.succeed(null)),
      );

      yield* Effect.forEach(
        specs,
        (spec) =>
          sql`INSERT INTO jobs (id, key, book_id, kind, ref, priority, trace_context) VALUES (${randomUUID()}, ${spec.key}, ${spec.bookId}, ${spec.kind}, ${spec.ref}, ${spec.priority}, ${trace ? sql.json(trace) : null}) ON CONFLICT (key) DO NOTHING`,
      );
    });

    return BookRepository.of({
      create: Effect.fn("Books.create")((book, jobs) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`INSERT INTO books (id, owner_id, state) VALUES (${book.id}, ${book.ownerId}, ${sql.json(book)})`;

              yield* enqueue(jobs);
            }),
          )
          .pipe(Effect.mapError(databaseFailure("create"))),
      ),
      get: Effect.fn("Books.get")(function* (id) {
        const rows = yield* sql`SELECT state FROM books WHERE id = ${id}`.pipe(
          Effect.flatMap(decodeStates),
          Effect.mapError(databaseFailure("get")),
        );

        return rows[0]?.state ?? null;
      }),
      list: Effect.fn("Books.list")(function* (owner) {
        const rows =
          yield* sql`SELECT state FROM books WHERE owner_id = ${owner} ORDER BY created_at`.pipe(
            Effect.flatMap(decodeStates),
            Effect.mapError(databaseFailure("list")),
          );

        return rows.map((row) => row.state);
      }),
      change: Effect.fn("Books.change")((id, update, lease) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              if (lease) {
                const rows =
                  yield* sql`SELECT id FROM jobs WHERE id = ${lease.id} AND token = ${lease.token} AND status = 'running' AND lease_until > clock_timestamp() FOR UPDATE`;

                if (rows.length === 0)
                  return yield* new Conflict({ message: "Worker lease expired." });
              }

              const rows = yield* sql`SELECT state FROM books WHERE id = ${id} FOR UPDATE`.pipe(
                Effect.flatMap(decodeStates),
              );

              const row = rows[0];

              if (!row) return yield* new NotFound({ message: "Book not found." });

              const change = yield* update(row.state);

              yield* sql`UPDATE books SET state = ${sql.json(change.book)} WHERE id = ${id}`;

              yield* enqueue(change.jobs);
            }),
          )
          .pipe(
            Effect.catchTags({
              SqlError: (cause) => Effect.fail(databaseFailure("change")(cause)),
              SchemaError: (cause) => Effect.fail(databaseFailure("decode book")(cause)),
            }),
          ),
      ),
    });
  }),
);

/** PostgreSQL owns the clock and the retry schedule; each claim has a unique fencing token. */
export const QueueLive = Layer.effect(
  JobQueue,
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;

    return JobQueue.of({
      claim: Effect.fn("Jobs.claim")((kinds) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`UPDATE jobs SET status = 'failed', error = 'Worker stopped during its final attempt.' WHERE status = 'running' AND lease_until <= clock_timestamp() AND attempts >= 3`;

              const rows =
                yield* sql`WITH candidate AS (SELECT id FROM jobs WHERE kind IN ${sql.in(kinds)} AND available_at <= clock_timestamp() AND (status = 'queued' OR (status = 'running' AND lease_until <= clock_timestamp())) ORDER BY priority, created_at LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE jobs SET status = 'running', attempts = attempts + 1, token = ${randomUUID()}, lease_until = clock_timestamp() + interval '5 minutes', error = NULL FROM candidate WHERE jobs.id = candidate.id RETURNING jobs.id, jobs.key, jobs.book_id AS "bookId", jobs.kind, jobs.ref, jobs.priority, jobs.token, jobs.attempts, jobs.trace_context AS "traceContext"`.pipe(
                  Effect.flatMap(decodeJobs),
                );

              return rows[0] ?? null;
            }),
          )
          .pipe(Effect.mapError(databaseFailure("claim"))),
      ),
      complete: Effect.fn("Jobs.complete")((job) =>
        sql`UPDATE jobs SET status = 'done', lease_until = NULL WHERE id = ${job.id} AND token = ${job.token} AND status = 'running' AND lease_until > clock_timestamp()`.pipe(
          Effect.asVoid,
          Effect.mapError(databaseFailure("complete")),
        ),
      ),
      fail: Effect.fn("Jobs.fail")((job, message, retryable) =>
        sql`UPDATE jobs SET status = ${retryable && job.attempts < 3 ? "queued" : "failed"}, error = ${message.slice(0, 500)}, lease_until = NULL, available_at = clock_timestamp() + ${2 ** job.attempts} * interval '1 second' WHERE id = ${job.id} AND token = ${job.token} AND status = 'running' AND lease_until > clock_timestamp()`.pipe(
          Effect.asVoid,
          Effect.mapError(databaseFailure("fail")),
        ),
      ),
      retry: Effect.fn("Jobs.retry")((id) =>
        sql`UPDATE jobs SET status = 'queued', attempts = 0, error = NULL, available_at = clock_timestamp() WHERE book_id = ${id} AND status = 'failed'`.pipe(
          Effect.asVoid,
          Effect.mapError(databaseFailure("retry")),
        ),
      ),
      status: Effect.fn("Jobs.status")((id) =>
        sql`SELECT kind, status, attempts, error FROM jobs WHERE book_id = ${id} ORDER BY created_at`.pipe(
          Effect.flatMap(decodeStatus),
          Effect.mapError(databaseFailure("status")),
        ),
      ),
    });
  }),
);
