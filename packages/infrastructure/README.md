# Local infrastructure

This package owns local orchestration and telemetry. It has no dependency on the application packages and exposes no runtime library to them. AWS/Alchemy resources will be added only after separate approval.

- `src/local.ts`: Effect CLI for dependency startup, validation, foreground development and shutdown.
- `src/control.ts`: scoped Unix socket used by `local:down` to stop this workspace's supervised session. No PID files or process-name matching.
- `src/telemetry.ts`: reads and decodes retained OTLP records, preserving parent IDs and service resources.
- `src/inspect.ts`: agent-friendly trace and event commands.
- `local/compose.yaml`: PostgreSQL, Mailpit and lightweight collector.
- `local/collector.yaml`: OTLP ingestion, memory limits and rotating file exporters.
- `local/dashboard.yaml`: optional Grafana LGTM service.
- `local/dashboard-collector.yaml` and `local/collector-dashboard.yaml`: opt-in Compose and collector overlays for forwarding new telemetry to the dashboard.

Run commands from the repository root:

```sh
pnpm local:up
# In another terminal:
pnpm telemetry:traces
pnpm telemetry:events --follow
pnpm telemetry:dashboard
pnpm telemetry:dashboard:stop
pnpm local:down
```

`local:up` runs in the foreground and owns its web/worker children and dependency containers. Ctrl+C also closes that session. Start one managed session per workspace. Independently launched `pnpm dev` processes belong to their own terminal and must be stopped there.

For dependency-only startup (including CI), use `pnpm local:setup`, `pnpm services:up`, then the root migration and validation commands. `services:down` stops a managed session if present and shuts down containers.

The S3 service remains independent in `packages/local-storage`; this package invokes its commands. Its API is the S3 endpoint, not a TypeScript import.

The PostgreSQL Compose project remains named `imagine-reader`, the S3 project `imagine-reader-storage`, and the optional dashboard project `imagine-observability`. Their existing named volumes are reused. Stop commands never remove volumes. Local telemetry files live in the ignored `.data/telemetry` directory. Application configuration remains in the root `.env`; no cloud account is required.

See [observability](../../docs/observability.md) for retention, ports and inspection details, and the [root README](../../README.md) for application setup.
