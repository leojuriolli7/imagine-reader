import { BookWorkflow } from "../domain/book-workflow";
import { Effect, Layer } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Api, Authorization, CurrentReader } from "@imagine/contracts";
import {
  Conflict,
  InvalidInput,
  NotFound,
  Unauthorized,
  Unavailable,
} from "@imagine/contracts/errors";
import { bookView } from "@imagine/contracts/models";
import type { AuthenticationError, DatabaseError, StorageError } from "../domain/errors";
import { Library } from "../data/library";
import { Authenticator } from "../data/ports";
import { AppConfig } from "../infrastructure/config";

const publicError = (
  cause: DatabaseError | StorageError | AuthenticationError | InvalidInput | NotFound | Conflict,
) => {
  if (cause._tag === "InvalidInput" || cause._tag === "NotFound" || cause._tag === "Conflict")
    return cause;

  return new Unavailable({ message: "Service temporarily unavailable. Please try again." });
};

const privateHeaders = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const auth = yield* Authenticator;

    const config = yield* AppConfig;

    return Effect.fn("Http.authorize")(function* (httpEffect) {
      const request = yield* HttpServerRequest.HttpServerRequest;

      if (
        request.method !== "GET" &&
        request.method !== "HEAD" &&
        request.headers.origin !== config.origin
      )
        return yield* new Unauthorized({ message: "Request origin is not allowed." });

      const identity = yield* auth
        .identify(new Headers(request.headers))
        .pipe(
          Effect.mapError(
            () => new Unavailable({ message: "Authentication temporarily unavailable." }),
          ),
        );

      if (!identity) return yield* new Unauthorized({ message: "Please sign in." });

      return yield* httpEffect.pipe(
        Effect.provideService(CurrentReader, identity),
        Effect.map((response) => HttpServerResponse.setHeaders(response, privateHeaders)),
      );
    });
  }),
);

export const BooksHandlers = HttpApiBuilder.group(
  Api,
  "books",
  Effect.fn(function* (handlers) {
    const library = yield* Library;

    return handlers.handleAll({
      list: Effect.fn(function* () {
        const reader = yield* CurrentReader;

        return (yield* library.list(reader.id).pipe(Effect.mapError(publicError))).map(bookView);
      }),
      upload: Effect.fn(function* ({ payload, query }) {
        const reader = yield* CurrentReader;

        return bookView(
          yield* library.upload(reader.id, query.title, payload).pipe(Effect.mapError(publicError)),
        );
      }),
      get: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        return bookView(
          yield* library.owned(reader.id, params.id).pipe(Effect.mapError(publicError)),
        );
      }),
      progress: Effect.fn(function* ({ params, payload }) {
        const reader = yield* CurrentReader;

        yield* library
          .progress(reader.id, params.id, payload.page)
          .pipe(Effect.mapError(publicError));
      }),
      remove: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        yield* library.remove(reader.id, params.id).pipe(Effect.mapError(publicError));
      }),
      retry: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        yield* library.retry(reader.id, params.id).pipe(Effect.mapError(publicError));
      }),
      jobs: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        return yield* library.jobs(reader.id, params.id).pipe(Effect.mapError(publicError));
      }),
      inspect: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        const book = yield* library.owned(reader.id, params.id).pipe(Effect.mapError(publicError));

        const jobs = yield* library.jobs(reader.id, params.id).pipe(Effect.mapError(publicError));

        return {
          config: book.config,
          batches: book.batches,
          artDirection: book.artDirection,
          characters: book.characters,
          summary: book.summary,
          pages: book.pages.filter((page) =>
            book.illustrations.some((image) => image.sourcePages.includes(page.page)),
          ),
          jobs,
          workflow: BookWorkflow.describe(book, jobs),
        };
      }),
      file: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        const bytes = yield* library.file(reader.id, params.id).pipe(Effect.mapError(publicError));

        return HttpServerResponse.uint8Array(bytes, {
          contentType: "application/pdf",
          headers: { "content-disposition": "inline" },
        });
      }),
      image: Effect.fn(function* ({ params }) {
        const reader = yield* CurrentReader;

        const image = yield* library
          .image(reader.id, params.id, params.imageId)
          .pipe(Effect.mapError(publicError));

        return HttpServerResponse.uint8Array(image.bytes, {
          contentType: image.mediaType,
          headers: { "content-security-policy": "default-src 'none'; sandbox" },
        });
      }),
    });
  }),
);
