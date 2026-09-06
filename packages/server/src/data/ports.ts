import type { Conflict, InvalidInput, NotFound } from "@imagine/contracts/errors";
import type {
  BatchInput,
  Book,
  Identity,
  Job,
  JobKind,
  JobSpec,
  JobStatus,
  Passage,
  PipelineConfig,
  Plan,
} from "@imagine/contracts/models";
import { Context, Effect } from "effect";
import type {
  AuthenticationError,
  DatabaseError,
  ProviderError,
  StorageError,
} from "../domain/errors";

export class Authenticator extends Context.Service<
  Authenticator,
  {
    identify(headers: Headers): Effect.Effect<Identity | null, AuthenticationError>;
    handler(request: Request): Effect.Effect<Response, AuthenticationError>;
  }
>()("imagine/Authenticator") {}

export class BlobStorage extends Context.Service<
  BlobStorage,
  {
    put(key: string, bytes: Uint8Array, mediaType: string): Effect.Effect<void, StorageError>;
    get(key: string): Effect.Effect<Uint8Array, StorageError>;
    remove(key: string): Effect.Effect<void, StorageError>;
    readonly check: Effect.Effect<void, StorageError>;
  }
>()("imagine/BlobStorage") {}

export class Extractor extends Context.Service<
  Extractor,
  {
    extract(
      bytes: Uint8Array,
    ): Effect.Effect<{ passages: readonly Passage[]; pageCount: number }, InvalidInput>;
  }
>()("imagine/Extractor") {}

export class Illustrations extends Context.Service<
  Illustrations,
  {
    plan(input: BatchInput, config: PipelineConfig): Effect.Effect<Plan, ProviderError>;
    render(
      prompt: string,
      config: PipelineConfig,
    ): Effect.Effect<{ bytes: Uint8Array; mediaType: string; model: string }, ProviderError>;
  }
>()("imagine/Illustrations") {}

export interface Change {
  readonly book: Book;
  readonly jobs: readonly JobSpec[];
}

/** State and outbox changes share one transaction; leased writes fence stale workers. */
export class BookRepository extends Context.Service<
  BookRepository,
  {
    create(book: Book, jobs: readonly JobSpec[]): Effect.Effect<void, DatabaseError>;
    get(id: string): Effect.Effect<Book | null, DatabaseError>;
    list(owner: string): Effect.Effect<readonly Book[], DatabaseError>;
    change(
      id: string,
      update: (book: Book) => Effect.Effect<Change, InvalidInput | Conflict | NotFound>,
      lease?: Job,
    ): Effect.Effect<void, DatabaseError | InvalidInput | Conflict | NotFound>;
  }
>()("imagine/BookRepository") {}

export class JobQueue extends Context.Service<
  JobQueue,
  {
    claim(kinds: readonly JobKind[]): Effect.Effect<Job | null, DatabaseError>;
    complete(job: Job): Effect.Effect<void, DatabaseError>;
    fail(job: Job, error: string, retryable: boolean): Effect.Effect<void, DatabaseError>;
    retry(id: string): Effect.Effect<void, DatabaseError>;
    status(id: string): Effect.Effect<readonly JobStatus[], DatabaseError>;
  }
>()("imagine/JobQueue") {}

export class ReaderSettings extends Context.Service<ReaderSettings, PipelineConfig>()(
  "imagine/ReaderSettings",
) {}
