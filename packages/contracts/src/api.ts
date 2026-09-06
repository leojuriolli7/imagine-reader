import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { Conflict, InvalidInput, NotFound, Unauthorized, Unavailable } from "./errors";
import {
  BookView,
  Id,
  Identity,
  JobStatus,
  Page,
  Passage,
  PipelineConfig,
  SavedBatch,
} from "./models";

export class CurrentReader extends Context.Service<CurrentReader, Identity>()(
  "imagine/CurrentReader",
) {}

export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  { provides: CurrentReader }
>()("imagine/Authorization", { error: [Unauthorized, Unavailable] }) {}

const binary = Schema.Uint8Array.pipe(
  HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }),
);

const errors = [InvalidInput, NotFound, Conflict, Unavailable];

export const Inspector = Schema.Struct({
  config: PipelineConfig,
  batches: Schema.Array(SavedBatch),
  passages: Schema.Array(Passage),
  jobs: Schema.Array(JobStatus),
});

export class BooksApi extends HttpApiGroup.make("books")
  .add(
    HttpApiEndpoint.get("list", "/api/books", { success: Schema.Array(BookView), error: errors }),
    HttpApiEndpoint.post("upload", "/api/books", {
      query: { title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)) },
      payload: binary,
      success: BookView,
      error: errors,
    }),
    HttpApiEndpoint.get("get", "/api/books/:id", {
      params: { id: Id },
      success: BookView,
      error: errors,
    }),
    HttpApiEndpoint.post("progress", "/api/books/:id/progress", {
      params: { id: Id },
      payload: Schema.Struct({ page: Page }),
      success: Schema.Void,
      error: errors,
    }),
    HttpApiEndpoint.post("retry", "/api/books/:id/retry", {
      params: { id: Id },
      success: Schema.Void,
      error: errors,
    }),
    HttpApiEndpoint.get("jobs", "/api/books/:id/jobs", {
      params: { id: Id },
      success: Schema.Array(JobStatus),
      error: errors,
    }),
    HttpApiEndpoint.get("inspect", "/api/books/:id/inspect", {
      params: { id: Id },
      success: Inspector,
      error: errors,
    }),
    HttpApiEndpoint.get("file", "/api/books/:id/file", {
      params: { id: Id },
      success: binary,
      error: errors,
    }),
    HttpApiEndpoint.get("image", "/api/books/:id/images/:imageId", {
      params: { id: Id, imageId: Id },
      success: binary,
      error: errors,
    }),
  )
  .middleware(Authorization) {}

export class Api extends HttpApi.make("ImagineReader").add(BooksApi) {}
