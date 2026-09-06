import { NodeRuntime } from "@effect/platform-node";
import { AppLive } from "@imagine/server/main/runtime";
import { Worker } from "@imagine/server/data/worker";
import { Effect } from "effect";

Effect.gen(function* () {
  const worker = yield* Worker;

  yield* Effect.logInfo("Worker running: one planning lane and two image lanes.");

  yield* worker.run;
}).pipe(Effect.provide(AppLive), NodeRuntime.runMain);
