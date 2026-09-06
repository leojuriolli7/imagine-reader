# Environment

`packages/server/src/infrastructure/config.ts` owns application Config definitions and Schema validation. Required settings fail at startup; secrets use Redacted values. `.env.example` matches local services. Restart both hosts after changing settings.

| Variable | Meaning / default |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL |
| `BETTER_AUTH_URL` | Required HTTP(S) origin, no path/trailing slash |
| `BETTER_AUTH_SECRET` | Required secret, at least 32 characters; local setup generates it |
| `SMTP_URL` | Required SMTP(S) URL; local port 51025 |
| `EMAIL_FROM` | Defaults to ImagineReader local sender |
| `AI_MODE` | `demo` (default) or `openai` |
| `OPENAI_API_KEY` | Required for real AI work |
| `PLANNER_MODEL` | `gpt-4.1-mini` |
| `IMAGE_MODEL` | `gpt-image-2` |
| `S3_BUCKET` | Required private bucket |
| `S3_ENDPOINT` | HTTP(S) endpoint; blank uses AWS |
| `S3_REGION` | `us-east-1` |
| `S3_FORCE_PATH_STYLE` | Boolean, defaults to false; true for local service |
| `AWS_ACCESS_KEY_ID` | Optional static credential; supply with secret key |
| `AWS_SECRET_ACCESS_KEY` | Optional static secret |
| `AWS_SESSION_TOKEN` | Optional session credential; requires static key pair |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP HTTP collector origin |
| `OTEL_SERVICE_NAME` | Trace/log/metric service identity; defaults to `imagine-reader` |
| `NODE_ENV` | development (default), test or production |
| `PORT` | Web listener, default 3000 |

The standard AWS credential chain handles workload identities when static credentials are absent. Runtime/platform settings consumed internally by Node, Next.js, or the AWS SDK remain owned by those tools.

Integration tests use typed Config overrides from `tests/support.ts`: `TEST_DATABASE_URL`, `TEST_SMTP_URL`, `TEST_S3_ENDPOINT`, `TEST_S3_BUCKET`, `TEST_S3_ACCESS_KEY_ID`, `TEST_S3_SECRET_ACCESS_KEY`, and optional `TEST_OTEL_EXPORTER_OTLP_ENDPOINT`. Defaults match Docker. The test database name must end in `_test`; application data is never selected as the test database.
