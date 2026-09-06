import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { BlobStorage } from "../data/ports";
import { StorageLive } from "../infrastructure/storage/s3";
import { AppConfig } from "../infrastructure/config";

Effect.gen(function* () {
  const storage = yield* BlobStorage;

  yield* storage.check;

  yield* Effect.logInfo("S3 bucket is accessible.");
}).pipe(Effect.provide(StorageLive.pipe(Layer.provide(AppConfig.layer))), NodeRuntime.runMain);
