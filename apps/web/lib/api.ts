"use client";

import { queryOptions, mutationOptions } from "@tanstack/react-query";
import { Api } from "@imagine/contracts";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
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

/** Hierarchical keys keep list, book and job caches distinct. */
export const queries = {
  list: () =>
    queryOptions({
      queryKey: ["books", "list"],
      queryFn: ({ signal }) =>
        runtime.runPromise(
          Effect.flatMap(ApiClient, (api) => api.books.list()),
          { signal },
        ),
    }),
  book: (id: string) =>
    queryOptions({
      queryKey: ["books", "detail", id],
      queryFn: ({ signal }) =>
        runtime.runPromise(
          Effect.flatMap(ApiClient, (api) => api.books.get({ params: { id } })),
          { signal },
        ),
    }),
  jobs: (id: string) =>
    queryOptions({
      queryKey: ["books", "detail", id, "jobs"],
      queryFn: ({ signal }) =>
        runtime.runPromise(
          Effect.flatMap(ApiClient, (api) => api.books.jobs({ params: { id } })),
          { signal },
        ),
    }),
};

export const mutations = {
  progress: (id: string) =>
    mutationOptions({
      mutationKey: ["books", "progress", id],
      scope: { id: `progress:${id}` },
      mutationFn: (page: number) =>
        runtime.runPromise(
          Effect.flatMap(ApiClient, (api) =>
            api.books.progress({ params: { id }, payload: { page } }),
          ),
        ),
    }),
  remove: () =>
    mutationOptions({
      mutationKey: ["books", "remove"],
      mutationFn: (id: string) =>
        runtime.runPromise(
          Effect.flatMap(ApiClient, (api) => api.books.remove({ params: { id } })),
        ),
    }),
  retry: (id: string) =>
    mutationOptions({
      mutationKey: ["books", "retry", id],
      mutationFn: () =>
        runtime.runPromise(Effect.flatMap(ApiClient, (api) => api.books.retry({ params: { id } }))),
    }),
  upload: () =>
    mutationOptions({
      mutationKey: ["books", "upload"],
      mutationFn: (form: FormData) =>
        runtime.runPromise(
          Effect.gen(function* () {
            const file = yield* Schema.decodeUnknownEffect(Schema.instanceOf(File))(
              form.get("file"),
            );

            const title = String(form.get("title") || file.name.replace(/\.pdf$/i, ""));

            const bytes = yield* Effect.tryPromise(() => file.arrayBuffer());

            const api = yield* ApiClient;

            return yield* api.books.upload({ query: { title }, payload: new Uint8Array(bytes) });
          }),
        ),
    }),
};
