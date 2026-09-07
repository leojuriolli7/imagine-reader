import { ObjectPublication } from "../data/object-publication";
import { NodeServices } from "@effect/platform-node";
import { Api } from "@imagine/contracts";
import { Effect, FileSystem, Layer, ManagedRuntime } from "effect";
import { HttpIncomingMessage, HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Library, MAX_PDF_BYTES } from "../data/library";
import { BookPipeline } from "../data/book-pipeline";
import { ExtractBook } from "../data/steps/extract-book";
import { EstablishArtDirection } from "../data/steps/establish-art-direction";
import { PlanReadingWindow } from "../data/steps/plan-reading-window";
import { RenderIllustration } from "../data/steps/render-illustration";
import { ReaderSettings } from "../data/ports";
import { Worker } from "../data/worker";
import { AiLive } from "../infrastructure/ai/provider";
import { AuthLive } from "../infrastructure/auth/better-auth";
import { AppConfig } from "../infrastructure/config";
import { DatabaseLive } from "../infrastructure/db/connection";
import { QueueLive, RepositoryLive } from "../infrastructure/db/repository";
import { PdfLive } from "../infrastructure/pdf";
import { StorageLive } from "../infrastructure/storage/s3";
import { AuthorizationLive, BooksHandlers } from "../presentation/http";
import { ObservabilityLive } from "./observability";

const PersistenceLive = Layer.mergeAll(RepositoryLive, QueueLive).pipe(Layer.provide(DatabaseLive));

const InfrastructureLive = Layer.mergeAll(PersistenceLive, StorageLive, PdfLive, AiLive, AuthLive);

const ReaderSettingsLive = Layer.effect(
  ReaderSettings,
  Effect.map(AppConfig, (config) => ({
    version: "1",
    mode: config.mode,
    plannerModel: config.plannerModel,
    imageModel: config.imageModel,
  })),
);

const UseCasesLive = Layer.mergeAll(
  Library.layer,
  Worker.layer.pipe(
    Layer.provide(
      BookPipeline.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            ExtractBook.layer,
            EstablishArtDirection.layer,
            PlanReadingWindow.layer,
            RenderIllustration.layer,
          ),
        ),
      ),
    ),
  ),
).pipe(
  Layer.provide(ObjectPublication.layer),
  Layer.provideMerge(InfrastructureLive),
  Layer.provide(ReaderSettingsLive),
);

export const AppLive = UseCasesLive.pipe(
  Layer.provideMerge(ObservabilityLive),
  Layer.provideMerge(AppConfig.layer),
  Layer.provide(NodeServices.layer),
);

const HttpLive = HttpApiBuilder.layer(Api, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide(BooksHandlers),
  Layer.provide(AuthorizationLive),
  Layer.provideMerge(AppLive),
  Layer.provide(HttpServer.layerServices),
  Layer.provide(Layer.succeed(HttpIncomingMessage.MaxBodySize, FileSystem.Size(MAX_PDF_BYTES))),
);

/** One runtime and shared Layer memo map per host; resources close together on shutdown. */
export function createRuntime() {
  const runtime = ManagedRuntime.make(AppLive);

  const http = HttpRouter.toWebHandler(HttpLive, { memoMap: runtime.memoMap });

  return {
    runtime,
    handler: http.handler,
    dispose: () => http.dispose().then(() => runtime.dispose()),
  };
}
