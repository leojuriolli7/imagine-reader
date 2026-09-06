"use client";

import { Api } from "@imagine/contracts";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  "imagine/browser/ApiClient",
) {
  static readonly layer = Layer.effect(
    ApiClient,
    Effect.suspend(() => HttpApiClient.make(Api, { baseUrl: window.location.origin })),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}

const runtime = ManagedRuntime.make(ApiClient.layer);

export const queries = {
  list: (signal?: AbortSignal) =>
    runtime.runPromise(
      Effect.flatMap(ApiClient, (api) => api.books.list()),
      { signal },
    ),
  book: (id: string, signal?: AbortSignal) =>
    runtime.runPromise(
      Effect.flatMap(ApiClient, (api) => api.books.get({ params: { id } })),
      { signal },
    ),
  jobs: (id: string, signal?: AbortSignal) =>
    runtime.runPromise(
      Effect.flatMap(ApiClient, (api) => api.books.jobs({ params: { id } })),
      { signal },
    ),
  progress: (id: string, page: number) =>
    runtime.runPromise(
      Effect.flatMap(ApiClient, (api) => api.books.progress({ params: { id }, payload: { page } })),
    ),
  retry: (id: string) =>
    runtime.runPromise(Effect.flatMap(ApiClient, (api) => api.books.retry({ params: { id } }))),
  upload: (file: File, title: string) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const bytes = yield* Effect.tryPromise(() => file.arrayBuffer());

        const api = yield* ApiClient;

        return yield* api.books.upload({ query: { title }, payload: new Uint8Array(bytes) });
      }),
    ),
};

export const keys = {
  library: ["library"] as const,
  book: (id: string) => ["book", id] as const,
  jobs: (id: string) => ["jobs", id] as const,
};
