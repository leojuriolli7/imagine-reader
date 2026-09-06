# Effect

This repository uses the Effect Typescript library.
Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow the links in the file when required.
If you need to learn more about particular Effect APIs and concepts that the guide does not cover, search through `node_modules/effect/src`.
Use the exact installed Effect 4 APIs. Do not mix documentation from other releases.

# Architecture

- Use Effect Schema for domain and transport contracts, Config for environment settings, Context.Service for dependencies, and Layers for implementations.
- Import symbols directly from their defining modules. Do not add forwarding re-exports or barrel files; package export maps should point directly to source modules.
- Use named Effect.fn operations and tagged errors. Keep resource ownership scoped. Run effects only at host boundaries.
- PostgreSQL owns durable jobs, leases, and retries. Provider clients must not add hidden retries.
- Keep framework and vendor code in infrastructure, presentation, and main. Shared browser contracts belong in packages/contracts.
- Use Effect SQL for persistence, Effect AI for planning, Effect HTTP for transport, and React Query for frontend server state.
- Keep trace context on durable jobs. Provide observability to the runtime and HTTP context; verify cross-process parentage after changing composition.
- Keep the independent local S3 service in packages/local-storage. No API dependency on that package.
- Decode external data; do not cast it into trusted types or fabricate test doubles with assertions.
- Separate logical blocks and functions with blank lines. Explain non-obvious invariants with concise JSDoc.
- Keep tests for observable behavior: ownership, transactions, timelines, resource cleanup, and retry decisions. No compatibility paths or historical implementation tests.
- Run pnpm check and the appropriate integration tests. Use plain pnpm commands.

# Next.js

Before editing Next.js code, read the relevant installed guide in apps/web/node_modules/next/dist/docs. This version has API changes; do not rely on remembered older APIs.
