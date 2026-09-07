import { readFileSync } from "node:fs";
import { assert, it } from "@effect/vitest";
import { Api } from "@imagine/contracts";
import { BookView } from "@imagine/contracts/models";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Authenticator } from "../src/data/ports";
import { Worker } from "../src/data/worker";
import { AuthorizationLive, BooksHandlers } from "../src/presentation/http";
import { TestApp, testOwner } from "./support";

const Identity = Layer.succeed(
  Authenticator,
  Authenticator.of({
    identify: (headers) =>
      Effect.succeed(
        headers.get("cookie") === "test-reader=present"
          ? { id: testOwner, name: "Reader", email: "reader@example.com" }
          : null,
      ),
    handler: () => Effect.succeed(new Response(null, { status: 404 })),
  }),
);

const Routes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(BooksHandlers),
  Layer.provide(AuthorizationLive.pipe(Layer.provide(Identity))),
  Layer.provideMerge(TestApp),
  Layer.provide(HttpServer.layerServices),
);

it.live("enforces authentication, origin and request schemas through the HTTP boundary", () =>
  Effect.gen(function* () {
    const web = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(Routes)),
      (web) => Effect.promise(() => web.dispose()),
    );

    const request = (path: string, init?: RequestInit) =>
      Effect.tryPromise(() => web.handler(new Request(`http://localhost:3000${path}`, init)));

    assert.strictEqual((yield* request("/api/books")).status, 401);

    assert.strictEqual(
      (yield* request("/api/books", { headers: { cookie: "test-reader=present" } })).status,
      200,
    );

    assert.strictEqual(
      (yield* request("/api/books/book/progress", {
        method: "POST",
        headers: {
          cookie: "test-reader=present",
          origin: "https://other.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ page: 1 }),
      })).status,
      401,
    );

    assert.strictEqual(
      (yield* request("/api/books/book/progress", {
        method: "POST",
        headers: {
          cookie: "test-reader=present",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ page: -1 }),
      })).status,
      400,
    );
  }),
);

it.live("runs an HTTP upload through the worker and serves its illustration", () =>
  Effect.gen(function* () {
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(TestApp)),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );

    const web = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(Routes, { memoMap: runtime.memoMap })),
      (web) => Effect.promise(() => web.dispose()),
    );

    const request = (path: string, init?: RequestInit) =>
      Effect.tryPromise(() =>
        web.handler(
          new Request(`http://localhost:3000${path}`, {
            ...init,
            headers: {
              cookie: "test-reader=present",
              origin: "http://localhost:3000",
              ...init?.headers,
            },
          }),
        ),
      );

    const bytes = yield* Effect.sync(
      () => new Uint8Array(readFileSync(new URL("./fixtures/story.pdf", import.meta.url))),
    );

    const uploaded = yield* request("/api/books?title=HTTP%20workflow", {
      method: "POST",
      body: bytes,
      headers: { "content-type": "application/octet-stream" },
    });

    assert.strictEqual(uploaded.status, 200);

    const book = yield* Effect.tryPromise(() => uploaded.json()).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(BookView)),
    );

    yield* Effect.tryPromise(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          const worker = yield* Worker;

          for (let attempt = 0; attempt < 12; attempt++)
            yield* worker.tick(["extract", "art-direction", "plan", "render"]);
        }),
      ),
    );

    const response = yield* request(`/api/books/${book.id}`);

    const ready = yield* Effect.tryPromise(() => response.json()).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(BookView)),
    );

    const illustration = ready.illustrations.find((image) => image.ready);

    assert.isDefined(illustration);

    if (!illustration) return;

    const image = yield* request(
      `/api/books/${book.id}/images/${encodeURIComponent(illustration.id)}`,
    );

    assert.strictEqual(image.status, 200);

    assert.strictEqual(image.headers.get("content-type"), "image/svg+xml");
  }),
);
