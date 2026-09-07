# Observability

The application exports Effect-native OTLP/HTTP JSON. `ObservabilityLive` wires tracing, structured logs and metrics into each host's runtime and the HTTP handler context. Resources flush when their scope closes; the worker uses NodeRuntime for shutdown. Export failure does not fail application requests.

## Local use

`pnpm local:up` starts the core OpenTelemetry Collector, not Grafana LGTM. It accepts OTLP HTTP on `127.0.0.1:4318` and writes JSONL traces, logs and metrics to `packages/infrastructure/.data/telemetry`.

Each signal rotates at 5 MB, retaining at most two backups plus the active file (roughly 45 MB across three signals). Rotated files have a one-day retention setting; expiry cleanup occurs during rotation, not on a scheduled timer. The active file can contain older data. This is bounded local diagnostic storage, not a durable archive. Partial final records are ignored until the collector finishes writing them.

The collector container has a 192 MB memory limit and a 128 MB memory limiter. Ports bind to loopback. The container runs as root only to write the local bind mount consistently across Docker hosts; it has no Docker socket or application filesystem access.

`pnpm telemetry:start`, `pnpm telemetry:stop`, `pnpm telemetry:status`, and `pnpm telemetry:logs` manage the collector. A blank `OTEL_EXPORTER_OTLP_ENDPOINT` disables application export. Exporters are best-effort: unavailable telemetry does not fail application requests, and dropped telemetry is not replayed.

### Optional dashboards

Run `pnpm telemetry:dashboard` to start the separate pinned Grafana LGTM image and enable collector forwarding. The app endpoint remains `http://localhost:4318`; no app restart is needed. Existing local files are not replayed into the dashboard. New data continues to be saved locally as well as forwarded.

| Address | Purpose |
| --- | --- |
| http://localhost:53000 | Grafana, admin / admin |
| http://localhost:53200 | Tempo query API |
| http://localhost:53100 | Loki query API |
| http://localhost:54318 | Dashboard OTLP ingestion, used by the collector |

`pnpm telemetry:dashboard:stop` restores file-only collection and stops dashboards. Switching restarts the collector briefly, so some telemetry can be lost during the switch. Its configuration is reset to file-only on the next default local startup. Existing named dashboard volumes are retained.

## What is connected

HTTP requests establish a root span and accept W3C trace context. Named Effect operations create children for authorization, use cases, SQL, S3, PDF extraction and AI. SQL/outbox transactions persist the current trace ID, span ID and sampling flag alongside each job. Workers restore that parent before starting `Worker.attempt`. Follow-up jobs inherit the current worker trace. Automatic retries preserve that context; each attempt has its own span and attempt number.

Worker spans/logs include `book.id`, `job.id`, `job.kind` and `job.attempt`. Error spans identify the failed operation even when the worker handles the failure and schedules a retry. Counters `imagine.jobs.completed` and `imagine.jobs.failed_attempts` expose processing outcomes. Prometheus exposes their monotonic totals as `imagine_jobs_completed_total` and `imagine_jobs_failed_attempts_total`.

The workflow exposes `ExtractBook.execute`, `EstablishArtDirection.execute`, `PlanReadingWindow.execute`, and `RenderIllustration.execute`. Planning also contains `PlanningWindow` and `CharacterMemory` spans. Both `AI.artDirection` and `AI.plan` invoke structured generation.

Effect AI's `LanguageModel.generateObject` span includes OpenAI model, response ID and input/output token usage, with a child HTTP span. Image generation has `AI.render`, model/operation attributes and a child HTTP request. The installed Effect OpenAI package uses the Responses API for language models; image generation uses Effect HttpClient against the image endpoint.

Instrumentation does not add document bodies, prompts or credentials as attributes. HTTP metadata, SQL statement templates and error details are collected. Restrict access and retention as you would other application diagnostics.

## Live inspection by an agent

The Effect CLI decodes retained local OTLP JSON and returns JSON without requiring a query backend:

```sh
pnpm telemetry:traces
pnpm telemetry:trace <32-character-hex-trace-id>
pnpm telemetry:events
pnpm telemetry:events --follow
```

Trace inspection includes span and parent IDs, resource context, attributes, events and status. The list shows the latest twenty trace IDs. Events follow polls every second, retaining a bounded snapshot to avoid repeating records already printed. TraceQL and LogQL remain available through the optional dashboard, not through the file inspection commands.

An agent can run these commands without an API debug endpoint or user credentials. Traces may be incomplete while operations are running or once earlier spans have rotated out. Log batches include trace/span IDs to connect failures to a call tree.

## Deployed hosts

Use an OTLP HTTP collector reachable by both web and worker. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to its base URL; the exporters append `/v1/traces`, `/v1/logs`, and `/v1/metrics`. Use `OTEL_SERVICE_NAME=imagine-reader-web` and `imagine-reader-worker` to distinguish hosts while retaining trace continuity. A trusted collector can handle vendor authentication and routing. The future deployment can route to a managed telemetry provider through its supported protocol and authentication. AWS provisioning is not part of the local infrastructure package yet.

## Verification

`pnpm test:integration` exercises the real HTTP → upload → queue → worker → image route and cleans up its test data. To inspect those executions locally:

```sh
TEST_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm test:integration
pnpm telemetry:traces
```

Integration tests use a live clock for actual IO and telemetry. Unit tests use Effect's test services and verify persisted worker trace propagation independently of a collector.
