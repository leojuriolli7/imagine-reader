# ImagineReader

https://github.com/user-attachments/assets/a9b2467d-97b2-4867-9d68-537294fa89f


A private PDF reader that plans illustrations ahead of your reading position. Open a book while the worker extracts its text, establishes its art direction, plans the next fifty pages, and generates nearby scenes.

Built with Next.js, shadcn, React Query, Effect 4, Effect SQL/PostgreSQL, Better Auth, and S3. Shared Effect Schema contracts generate the HTTP client and OpenAPI description.

## Run locally

Requires Node 22.13+, pnpm 10.33.4, and Docker Desktop running.

```sh
pnpm install
pnpm local:up
```

`local:up` creates `.env` when missing, starts PostgreSQL, Mailpit, independent S3 and a lightweight OTLP collector, migrates and validates, then runs web/API and worker with hot reload in the foreground. Ctrl+C shuts down the session and its containers. `pnpm local:down` also stops that session from another terminal. Existing `.env` settings are preserved.

| Service | Address |
| --- | --- |
| Web | http://localhost:3000 |
| OpenAPI | http://localhost:3000/api/openapi.json | 
| Mail inbox | http://localhost:58025 |
| SMTP | localhost:51025 |
| PostgreSQL | localhost:55432 |
| S3 | http://localhost:58333 |
| Optional Grafana (`pnpm telemetry:dashboard`) | http://localhost:53000 |
| OTLP HTTP collector | http://localhost:4318 |

Register an account, upload a PDF with selectable text, and start reading. Limits: 25 MB, 2,000 pages, 5 million extracted characters, and 24,000 characters per page. Scanned PDFs require OCR before upload.

## Demo and AI

The default exercises the actual database, storage and job pipeline with deterministic demo plans and SVG illustrations:

```dotenv
AI_MODE=demo
OPENAI_API_KEY=
```

For real planning and image generation:

```dotenv
AI_MODE=openai
OPENAI_API_KEY=your-key
PLANNER_MODEL=gpt-4.1-mini
IMAGE_MODEL=gpt-image-2
```

Restart the web and worker after changing configuration. A book captures its mode and models on upload; its own art direction is established before planning; upload a new book to use different settings. OpenAI credentials need billing and access to the chosen models.

## Local S3

`packages/local-storage` owns an independent SeaweedFS process, Docker Compose project, network and persistent volume. The API and worker communicate through S3 HTTP, without importing this package.

```dotenv
S3_ENDPOINT=http://localhost:58333
S3_BUCKET=imagine-reader
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=imagine-local
AWS_SECRET_ACCESS_KEY=imagine-local-secret
AWS_SESSION_TOKEN=
```

The service creates the application and test buckets. Cloud S3 uses the same adapter: change the bucket, region and credentials; leave `S3_ENDPOINT` empty for AWS and set `S3_FORCE_PATH_STYLE=false`. Workload identities use the AWS credential chain when static keys are absent. Keep buckets private: authorized application routes serve documents and illustrations.

## Architecture

```text
apps/web                 Next.js host, shadcn UI, React Query
apps/worker              NodeRuntime background process
packages/contracts       Effect schemas, tagged HTTP errors, HttpApi definition
packages/server/src
  domain                 PlanningWindow, CharacterMemory and BookWorkflow
  data                   Effect services, use cases and dependency contracts
  infrastructure         Effect SQL, AI, auth, S3, PDF and Config adapters
  presentation           HttpApi handlers and authentication middleware
  main                   Layers, host runtime, telemetry and operational commands
packages/local-storage   Independent local S3 service
packages/infrastructure  Local orchestration, collector, optional dashboards and inspection CLI
packages/ui              Shared shadcn components
```

Application services depend on `Context.Service` contracts. Layers supply implementations. Each host owns its runtime and resource scope. Use cases return `Effect<Success, Error, Requirements>`; expected failures are tagged and handled explicitly. API schemas validate requests and responses, and the browser calls the generated client through React Query. See [architecture](docs/architecture.md) and [pipeline](docs/pipeline.md).

## Jobs and errors

PostgreSQL persists jobs and commits follow-up jobs atomically with book state. Claims use row locks, unique job keys and five-minute leases with fencing tokens. Each worker has one extraction/art-direction/planning lane and two rendering lanes.

Transient failures have three total attempts with two- and four-second retry delays. Invalid PDFs and permanent provider failures stop immediately. Owner-triggered retry resets failed jobs. Invalid provider plans may retry, with validation feedback; page references, chronology and character availability are checked before commit. Provider SDKs do not add another retry loop. A hard crash leaves a recoverable lease; a stale attempt cannot commit results. AI providers may charge twice if a process crashes after a successful external request and before saving its result.

NodeRuntime manages worker cancellation and scoped cleanup. Shutdown cancels in-flight interruptible work; compensation is bounded and response bodies are closed before resources release. Configure a process supervisor to restart unexpected worker exits. SQL remains the authority for durable recovery.

## Quality and observability

`pnpm install` installs the tracked Git pre-push hook. Each push runs TypeScript checks, unit tests, then the Next.js production build, stopping at the first failure. The build verifies bundling and framework constraints beyond TypeScript. Run the same sequence with `pnpm prepush`, or restore hook configuration with `pnpm hooks:install`. Integration tests remain separate because they require PostgreSQL, S3 and SMTP; the hook does not start local services. As with any local Git hook, CI should enforce the same checks for shared branches.

```sh
pnpm check
pnpm test:integration
pnpm build
```

Knip checks unused files, exports and dependencies in both normal and production graphs, catching code referenced only by tests. Oxlint and vendored anti-slop rules check application code. Biome handles formatting. Vitest and `@effect/vitest` exercise domain behavior and real service boundaries. Effect versions and Oxlint/plugin versions are pinned together. Read `AGENTS.md` before changing Effect code.

Effect exports traces, correlated logs and worker metrics to a lightweight collector. It writes rotating files under `packages/infrastructure/.data/telemetry`; no dashboards start by default. Run `pnpm telemetry:dashboard` for Grafana at http://localhost:53000 (admin / admin). Configuration:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=imagine-reader
```

Durable jobs retain their trace context: API upload → SQL/outbox → worker extraction → art direction → planning → rendering remain connected, including retries across process restarts. Effect AI records models, token usage and provider timing; image generation records its model and HTTP call. Named use cases, SQL, S3 and authentication operations appear as child spans.

```sh
pnpm telemetry:traces
pnpm telemetry:trace <trace-id>
pnpm telemetry:events --follow
```

These read-only JSON commands let an agent inspect the running service without adding debug endpoints to the API. Export and collector batching each take about a second. Inspection reads retained files, including rotated files; a trace can be incomplete while running or after retention expires. Leave the endpoint blank to disable export. In deployment, point both hosts at your OTLP HTTP collector and optionally use separate `OTEL_SERVICE_NAME` values for web and worker.

See [observability](docs/observability.md) for queries and deployment, [environment](docs/environment.md) for settings, and [testing](docs/testing.md) for verification.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm local:setup` | Create local `.env` when missing |
| `pnpm local:up` / `pnpm local:down` | Start/stop the complete foreground local session |
| `pnpm dev` | Web and worker development processes |
| `pnpm dev:web` / `pnpm dev:worker` | Start one development host |
| `pnpm services:up` / `pnpm services:down` | Start/stop all local infrastructure |
| `pnpm storage:start` / `pnpm storage:stop` | Start/stop only S3 |
| `pnpm telemetry:start` / `pnpm telemetry:stop` | Start/stop only the lightweight collector |
| `pnpm telemetry:dashboard` / `pnpm telemetry:dashboard:stop` | Enable/disable optional dashboards |
| `pnpm telemetry:traces` / `pnpm telemetry:trace <id>` | Inspect recent traces / a full call tree |
| `pnpm telemetry:events` / `pnpm telemetry:logs` | Query application logs / follow collector logs |
| `pnpm storage:restart` / `pnpm storage:logs` | Restart/inspect S3 |
| `pnpm env:check` / `pnpm storage:check` | Validate configuration/connectivity |
| `pnpm db:migrate` | Apply committed Effect SQL migrations |
| `pnpm lint` / `pnpm format` | Lint / format code |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` | Unit tests |
| `pnpm test:integration` | Real database, auth, HTTP and S3 tests |
| `pnpm deadcode` | Check unused files, exports and dependencies, including test-only code |
| `pnpm check` | Dead code, lint, formatting, TypeScript and unit tests |
| `pnpm build` | Build the web app |
| `pnpm deploy:prepare` | Validate settings/storage, check and build |
| `pnpm start:web` / `pnpm start:worker` | Start deployed hosts |

For `pnpm local:up`, Ctrl+C or `pnpm local:down` stops the managed session. Alternatively, `pnpm services:up` and `pnpm dev` can be run separately; stop that separate dev terminal with Ctrl+C before `pnpm services:down`. Named volumes preserve uploaded files and database records. AWS infrastructure code is deferred until separately approved.

## Deploy

Provision PostgreSQL, private S3, SMTP and an HTTPS origin. Run two supervised Node processes from the same release, sharing configuration and infrastructure. The worker requires a persistent process/container; it does not run inside an API invocation.

```sh
pnpm install --frozen-lockfile
pnpm deploy:prepare
pnpm db:migrate
```

Then supervise these commands separately:

```sh
pnpm start:web
pnpm start:worker
```

Set `DEV_MODE=false` to hide reader developer tools. This flag is independent of Next.js runtime mode. Set `NODE_ENV=production`, the public `BETTER_AUTH_URL`, a random auth secret, service credentials and AI settings. Inject secrets through the hosting environment or an untracked `.env`. Terminate TLS at the proxy, preserve cookies and Origin, and allow PDF request bodies up to 25 MB. Back up PostgreSQL and S3 together.

Deploy the full workspace, lockfile, dependencies, server TypeScript sources and `apps/web/.next`. Startup uses `tsx` and `dotenv-cli`, so install the full locked dependency tree. `pnpm install` copies the PDF browser worker asset. `deploy:prepare` does not publish to a hosting account or apply migrations; run migrations once per release. The local S3 package and Mailpit do not run as part of the deployed API.
