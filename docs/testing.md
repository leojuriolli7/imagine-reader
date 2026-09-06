# Testing

Use `pnpm check` for lint, formatting, TypeScript and unit tests. Use `pnpm test:integration` with local services running to validate persistence and external adapters. `pnpm build` checks the Next.js production build.

Tests express behavior of the current services:

- Planning: source grounding, immutable checkpoint facts, half-open spans and bounded batches.
- Configuration: validated inputs, conditional credentials and literal boolean handling.
- PDF: real text extraction and typed rejection of unreadable documents.
- Worker: permanent versus transient failures and queue acknowledgement decisions and persisted trace propagation.
- Integration: upload-to-image processing, authorization, transactional rollback, stale claims, S3 bytes and real auth sessions.
- HTTP: generated endpoint parsing, session middleware, origin checks and upload-to-image transport.
- Frontend: image eligibility and page navigation bounds.

Effect tests use `@effect/vitest`, real service Layers, and Effect's error channel. Integration tests use a separate `_test` database and bucket. Per-suite identities scope cleanup to the records and objects the suite created. No real AI credentials are used by automated tests.

Anti-slop is vendored in `tools/oxlint/anti-slop`. Its upstream revision and license are included. Upgrade Oxlint and `@oxlint/plugins` together. The Effect-specific rule currently checks relative constructor imports; TypeScript and architectural review remain necessary for package-alias imports.
