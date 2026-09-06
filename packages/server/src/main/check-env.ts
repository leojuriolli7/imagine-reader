import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { loadConfig } from "../infrastructure/config";

loadConfig.pipe(
  Effect.andThen(Effect.logInfo("Environment configuration is valid.")),
  NodeRuntime.runMain,
);
