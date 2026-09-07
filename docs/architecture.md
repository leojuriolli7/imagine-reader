# Effect architecture

## Dependency direction

`packages/contracts` defines Effect Schema models and HTTP contracts without server implementations. Domain rules depend on these models and Effect. The data layer defines service contracts and application operations. Infrastructure supplies vendor implementations; presentation translates HTTP into use cases; main builds Layers and host runtimes.

`Library`, `BookPipeline`, and `Worker` are contextual services. `BookRepository`, `JobQueue`, `BlobStorage`, `Extractor`, `Illustrations`, and `Authenticator` are dependency contracts. Tests provide complete service Layers rather than mocking imported modules or asserting partial objects into interfaces. `ReaderSettings` supplies the upload policy without exposing environment parsing to use cases.

## Navigating the workflow

Start at `domain/book-workflow.ts` for scheduling, then `data/book-pipeline.ts` for the exhaustive dispatch table. Each operation has its own contextual service: `ExtractBook`, `EstablishArtDirection`, `PlanReadingWindow`, and `RenderIllustration`. `PlanningWindow` encapsulates window preparation and plan compilation; `CharacterMemory` owns dated visual history and alias resolution. These domain classes hold relevant state, while Context services receive infrastructure through Layers. Imports point directly to defining files.

Adding a durable step requires adding its job kind, use-case service, scheduling rule, dispatch entry and Layer composition. The compiler checks that every job kind has an implementation. No generic agent framework or dynamically interpreted graph is needed.

## Resources and failures

Effect scopes own SQL pools, S3 clients, SMTP and auth pools. Database failures, storage failures, provider failures and authentication failures have tagged types. HTTP exposes public tagged errors without serializing infrastructure causes. Unexpected defects remain defects and are reported by the host runtime.

Database time controls leases and retry availability. SQL statements have a 15-second server deadline, lock waits a 5-second limit, and the client a 20-second query deadline. Storage body reads and compensation have explicit resource scopes and bounds. Effect Clock measures planning durations; the worker's idle waits use Effect scheduling primitives. A provider attempt has a bounded timeout and no hidden retries. The persistent job state controls retry counts. Provider output validation errors can retry; invalid uploaded documents cannot.

## Persistence

Effect SQL runs parameterized PostgreSQL queries. Every book read decodes JSONB through the Book schema. Book state is immutable in application code; repository callbacks return a replacement aggregate and follow-up jobs. The repository locks the book and writes both in one transaction. Lease-guarded mutations also lock and validate the claim row.

The book aggregate contains numbered pages, immutable upload settings, book art direction, dated character snapshots, a story summary, display spans, batches and illustration metadata. Relational columns index ownership and creation time. This design rewrites the aggregate on updates; page/plan normalization can be implemented behind BookRepository when needed.

SQL migrations live in `infrastructure/db/migrations/`. Register each migration in `migrations.ts`; `pnpm db:migrate` applies them with Effect's PostgreSQL migrator. Do not mutate completed migrations for an already deployed release.

## Hosts and clients

Next.js mounts the Effect HttpApi web handler. A shared Layer memo map lets HTTP and server-rendered pages reuse the same host services. The worker uses NodeRuntime and the same application Layers. The frontend imports only shared contracts and the typed HttpApi client; React Query owns network state, cancellation, polling and mutation status.

Better Auth keeps its own HTTP protocol and React client behind the auth adapter. It uses the same PostgreSQL service through a scoped pool, with explicit snake-case field mappings. Swapping auth providers requires replacing that adapter and frontend auth client; owner IDs must be mapped if existing accounts move.

The S3 adapter works against AWS or the independent local S3 package through configuration. No code imports the local service. Effect AI handles structured planning. Image generation uses Effect HttpClient behind Illustrations because the installed OpenAI Effect package exposes Responses/embeddings rather than an image-generation service.

## Observability

Named Effect.fn operations create spans. The shared observability Layer exports traces, correlated logs and worker metrics. It is provided to both the ManagedRuntime and the HTTP handler context. The outbox persists trace context with each job, and the worker restores it before starting a new attempt; API and worker operations form one distributed call tree. Effect AI adds model and token-usage annotations. See [observability](observability.md) for the local collector and live inspection commands.
