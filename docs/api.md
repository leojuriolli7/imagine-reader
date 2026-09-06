# API

All book routes require the session cookie. All POST requests require the configured Origin. Reads are private/no-store. Wrong-owner books return 404. JSON errors have `{ "error": "message" }`; invalid requests use 400, unauthenticated requests 401, unknown resources 404, stale changes 409, large bodies 413, unexpected failures 500.

| Method | Path | Input / result |
| --- | --- | --- |
| GET/POST | `/api/auth/*` | Better Auth handler: sign-up/email, sign-in/email, get-session, sign-out, request-password-reset, reset-password, verification |
| GET | `/api/books` | Safe library summaries |
| POST | `/api/books` | Multipart `file`, optional `title`; returns 201 with book; extraction queued atomically |
| GET | `/api/books/:id` | Status, progress, display spans, ready image IDs; no source text or prompts |
| GET | `/api/books/:id/file` | Authorized original PDF bytes |
| GET | `/api/books/:id/images/:imageId` | Authorized generated image; URL-encode illustration ID |
| POST | `/api/books/:id/progress` | JSON `{ "page": 12 }`; raises planning horizon and schedules nearby rendering |
| GET | `/api/books/:id/jobs` | Job kind/status/attempts/error for polling |
| POST | `/api/books/:id/retry` | Requeues exhausted jobs for this book |
| GET | `/api/books/:id/inspect` | Owner-only debugging JSON: pipeline configuration, batches, prompts, sources and jobs |

The inspector may expose later plot information and is intended for debugging. It is accessed deliberately in a separate tab. The normal reader DTO omits future prompts and extracted text.

File responses currently load whole objects into memory and do not implement HTTP range requests. The client PDF viewer fetches the supported bounded file. Streaming and signed download URLs can be added in the transport/storage adapters.
