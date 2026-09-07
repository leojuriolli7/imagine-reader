import { fileURLToPath } from "node:url";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { Command } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { controlled, stopSession } from "./control";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const compose = "packages/infrastructure/local/compose.yaml";
const dashboard = "packages/infrastructure/local/dashboard.yaml";
const overlay = "packages/infrastructure/local/dashboard-collector.yaml";

class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  command: Schema.String,
  exitCode: Schema.Number,
}) {}

/** Scoped children receive interruption when the local session ends. */
const run = Effect.fn("Local.run")(function* (command: string, args: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make(command, args, {
      cwd: root,
      forceKillAfter: "20 seconds",
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  );

  const exitCode = yield* child.exitCode;

  if (exitCode !== 0) return yield* new CommandFailed({ command, exitCode });
}, Effect.scoped);

const docker = (file: string, args: readonly string[]) =>
  run("docker", ["compose", "-f", file, ...args]);
const pnpm = (args: readonly string[]) => run("pnpm", args);

const servicesUp = Effect.fn("Local.servicesUp")(function* () {
  yield* docker(compose, ["up", "-d", "--wait"]);
  yield* pnpm(["storage:start"]);
});

const down = Effect.fn("Local.down")(function* () {
  yield* Effect.all(
    [docker(compose, ["down"]), docker(dashboard, ["down"]), pnpm(["storage:stop"])],
    { concurrency: "unbounded", mode: "result" },
  ).pipe(Effect.flatMap(Effect.forEach((result) => Effect.fromResult(result))));
});

const up = Effect.fn("Local.up")(function* () {
  yield* Effect.addFinalizer(() => down().pipe(Effect.catch(Effect.logError)));
  yield* pnpm(["local:setup"]);
  yield* servicesUp();
  yield* pnpm(["db:migrate"]);
  yield* pnpm(["env:check"]);
  yield* pnpm(["storage:check"]);
  yield* pnpm(["dev"]);
}, Effect.scoped);

const dashboardUp = Effect.fn("Local.dashboardUp")(function* () {
  yield* docker(dashboard, ["up", "-d", "--wait"]);
  yield* docker(compose, ["-f", overlay, "up", "-d", "--no-deps", "collector"]);
});

const dashboardDown = Effect.fn("Local.dashboardDown")(function* () {
  yield* docker(compose, ["up", "-d", "--no-deps", "collector"]);
  yield* docker(dashboard, ["down"]);
});

Command.make("local").pipe(
  Command.withSubcommands([
    Command.make("up", {}, () => controlled(up())),
    Command.make("down", {}, () => stopSession().pipe(Effect.andThen(down()))),
    Command.make("services-up", {}, servicesUp),
    Command.make("telemetry-up", {}, () => docker(compose, ["up", "-d", "collector"])),
    Command.make("telemetry-down", {}, () => docker(compose, ["stop", "collector"])),
    Command.make("telemetry-logs", {}, () => docker(compose, ["logs", "--follow", "collector"])),
    Command.make("telemetry-status", {}, () => docker(compose, ["ps", "collector"])),
    Command.make("dashboard-up", {}, dashboardUp),
    Command.make("dashboard-down", {}, dashboardDown),
  ]),
  Command.run({ version: "0.0.1" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
