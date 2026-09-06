import { randomUUID } from "node:crypto";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { InvalidInput } from "@imagine/contracts/errors";
import { Library } from "../src/data/library";
import { Worker } from "../src/data/worker";
import { Authenticator, BlobStorage, BookRepository, JobQueue } from "../src/data/ports";
import { TestApp, testOwner, testEmail } from "./support";

layer(TestApp, { timeout: "30 seconds", excludeTestServices: true })("platform services", (it) => {
  it.effect("uploads, extracts, plans, renders and serves a book", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const library = yield* Library;

      const worker = yield* Worker;

      const owner = testOwner;

      const bytes = yield* fs.readFile(
        fileURLToPath(new URL("./fixtures/story.pdf", import.meta.url)),
      );

      const book = yield* library.upload(owner, "Effect service test", bytes);

      yield* library.progress(owner, book.id, 1);

      assert.strictEqual((yield* library.owned(owner, book.id)).targetThrough, 50);

      for (let i = 0; i < 12; i++) yield* worker.tick(["extract", "plan", "render"]);

      const ready = yield* library.owned(owner, book.id);

      assert.strictEqual(ready.status, "ready");

      assert.strictEqual(ready.plannedThrough, ready.pageCount);

      assert.isTrue(ready.illustrations.some((i) => i.artifact !== null));

      assert.deepStrictEqual(yield* library.file(owner, book.id), bytes);

      assert.strictEqual(
        (yield* library.owned("another-reader", book.id).pipe(Effect.flip))._tag,
        "NotFound",
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rolls back failed state and outbox updates", () =>
    Effect.gen(function* () {
      const library = yield* Library;

      const repo = yield* BookRepository;

      const book = yield* library.upload(
        testOwner,
        "Original title",
        new TextEncoder().encode("%PDF-test"),
      );

      yield* repo
        .change(book.id, () => Effect.fail(new InvalidInput({ message: "Abort" })))
        .pipe(Effect.flip);

      assert.strictEqual((yield* repo.get(book.id))?.title, "Original title");

      yield* repo
        .change(book.id, (current) =>
          Effect.succeed({
            book: { ...current, title: "Must roll back" },
            jobs: [
              { key: randomUUID(), bookId: "missing-book", kind: "plan", ref: "1", priority: 0 },
            ],
          }),
        )
        .pipe(Effect.flip);

      assert.strictEqual((yield* repo.get(book.id))?.title, "Original title");
    }),
  );

  it.effect("rejects stale worker acknowledgements and retains permanent failures", () =>
    Effect.gen(function* () {
      const queue = yield* JobQueue;

      const job = yield* queue.claim(["extract"]);

      assert.isNotNull(job);

      if (!job) return;

      yield* queue.complete({ ...job, token: "stale-token" });

      assert.isTrue((yield* queue.status(job.bookId)).some((j) => j.status === "running"));

      yield* queue.fail(job, "Invalid PDF", false);

      assert.isTrue((yield* queue.status(job.bookId)).some((j) => j.status === "failed"));

      yield* queue.retry(job.bookId);

      assert.isTrue(
        (yield* queue.status(job.bookId)).some((j) => j.status === "queued" && j.attempts === 0),
      );
    }),
  );

  it.effect("round-trips binary storage through the local S3 service", () =>
    Effect.gen(function* () {
      const storage = yield* BlobStorage;

      const key = `tests/${randomUUID()}/binary file`;

      const bytes = new Uint8Array([0, 255, 127, 10]);

      yield* storage.put(key, bytes, "application/octet-stream");

      assert.deepStrictEqual(yield* storage.get(key), bytes);

      yield* storage.remove(key);

      assert.strictEqual((yield* storage.get(key).pipe(Effect.flip))._tag, "StorageError");
    }),
  );

  it.effect("registers, authenticates and revokes a real Better Auth session", () =>
    Effect.gen(function* () {
      const auth = yield* Authenticator;

      const email = testEmail;

      const request = (path: string, body: { email: string; password: string; name?: string }) =>
        new Request(`http://localhost:3000/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify(body),
        });

      const signup = yield* auth.handler(
        request("sign-up/email", {
          email,
          password: "long-test-password-123",
          name: "Test Reader",
        }),
      );

      assert.strictEqual(signup.status, 200);

      const login = yield* auth.handler(
        request("sign-in/email", { email, password: "long-test-password-123" }),
      );

      assert.strictEqual(login.status, 200);

      const cookie = login.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");

      const headers = new Headers({ cookie, origin: "http://localhost:3000" });

      assert.strictEqual((yield* auth.identify(headers))?.email, email);

      yield* auth.handler(
        new Request("http://localhost:3000/api/auth/sign-out", { method: "POST", headers }),
      );

      assert.strictEqual(yield* auth.identify(headers), null);
    }),
  );
});
