# Observability

The application exports Effect-native OTLP/HTTP JSON. `ObservabilityLive` wires tracing, structured logs and metrics into each host's runtime and the HTTP handler context. Resources flush when their scope closes; the worker uses NodeRuntime for shutdown. Export failure does not fail application requests.

## Local use

`pnpm local:up` includes `packages/local-observability`, an independent Docker Compose project using pinned `grafana/otel-lgtm:0.32.1`. PostgreSQL and S3 do not depend on it. The package exposes:

| Address | Purpose |
| --- | --- |
| http://localhost:53000 | Grafana, credentials admin / admin |
| http://localhost:4318 | OTLP HTTP ingestion |
| http://localhost:53200 | Tempo query API |
| http://localhost:53100 | Loki query API |

All ports bind to loopback. The named volume retains telemetry when stopped. `pnpm telemetry:start`, `pnpm telemetry:stop`, `pnpm telemetry:status`, and `pnpm telemetry:logs` manage this service alone.

Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env`, then run `pnpm dev`. Existing installations must run `pnpm db:migrate` for durable trace context. A blank endpoint disables exporters. Traces and logs export every second; metrics every five seconds. Search may lag ingestion, so use a known trace ID for immediate inspection.

## What is connected

HTTP requests establish a root span and accept W3C trace context. Named Effect operations create children for authorization, use cases, SQL, S3, PDF extraction and AI. SQL/outbox transactions persist the current trace ID, span ID and sampling flag alongside each job. Workers restore that parent before starting `Worker.attempt`. Follow-up jobs inherit the current worker trace. Automatic retries preserve that context; each attempt has its own span and attempt number.

Worker spans/logs include `book.id`, `job.id`, `job.kind` and `job.attempt`. Error spans identify the failed operation even when the worker handles the failure and schedules a retry. Counters `imagine.jobs.completed` and `imagine.jobs.failed_attempts` expose processing outcomes. Prometheus exposes their monotonic totals as `imagine_jobs_completed_total` and `imagine_jobs_failed_attempts_total`.

Effect AI's `LanguageModel.generateObject` span includes OpenAI model, response ID and input/output token usage, with a child HTTP span. Image generation has `AI.render`, model/operation attributes and a child HTTP request. The installed Effect OpenAI package uses the Responses API for language models; image generation uses Effect HttpClient against the image endpoint.

Instrumentation does not add document bodies, prompts or credentials as attributes. HTTP metadata, SQL statement templates and error details are collected. Restrict access and retention as you would other application diagnostics.

## Live inspection by an agent

The CLI uses Effect HTTP and Effect CLI, validates trace-ID arguments, and returns JSON. It only reads the local query APIs:

```sh
pnpm telemetry:traces
pnpm telemetry:trace <trace-id>
pnpm telemetry:events
pnpm telemetry:traces --query '{ span.job.id != nil }'
pnpm telemetry:traces --query '{ status = error }'
pnpm telemetry:events --query '{service_name=~"imagine-reader.*"} |= "Job attempt failed"'
```

A specific book can be found in Tempo with `{ span.book.id = "BOOK_ID" }`. Logs carry trace/span IDs, so an error log leads back to the complete call tree. In Grafana, open Explore and select Tempo, Loki or Prometheus. No special debugging route, account credential or code change is needed for an agent to inspect the local stack.

## Deployed hosts

Use an OTLP HTTP collector reachable by both web and worker. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to its base URL; the exporters append `/v1/traces`, `/v1/logs`, and `/v1/metrics`. Use `OTEL_SERVICE_NAME=imagine-reader-web` and `imagine-reader-worker` to distinguish hosts while retaining trace continuity. A trusted collector can handle vendor authentication and routing. Keep the local Grafana package separate from deployed API processes.

## Verification

`pnpm test:integration` exercises the real HTTP → upload → queue → worker → image route and cleans up its test data. To inspect those executions locally:

```sh
TEST_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm test:integration
pnpm telemetry:traces --query '{ resource.service.name = "imagine-reader-tests" }'
```

Integration tests use a live clock for actual IO and telemetry. Unit tests use Effect's test services and verify persisted worker trace propagation independently of a collector.
