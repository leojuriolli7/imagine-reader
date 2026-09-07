import { createConnection, createServer, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Schema } from "effect";

const directory = fileURLToPath(new URL("../.data/", import.meta.url));
const socketPath = `${directory}/local.sock`;

class LocalControlError extends Schema.TaggedError<LocalControlError>()("LocalControlError", {
  cause: Schema.Defect(),
}) {}

/** A workspace-local socket stops only this session, without PID reuse or process-name matching. */
export const controlled = Effect.fn("Local.controlled")(function* <A, E, R>(
  program: Effect.Effect<A, E, R>,
) {
  const fs = yield* FileSystem.FileSystem;

  yield* fs.makeDirectory(directory, { recursive: true });

  const clients = new Set<Socket>();
  const server = yield* Effect.acquireRelease(
    Effect.callback<ReturnType<typeof createServer>, LocalControlError>((resume) => {
      const listener = createServer();

      listener.once("error", (cause) => resume(Effect.fail(new LocalControlError({ cause }))));
      listener.listen(socketPath, () => resume(Effect.succeed(listener)));
    }),
    (listener) =>
      Effect.sync(() => {
        listener.close();

        for (const client of clients) client.end();
      }),
  );

  const stopped = Effect.callback<void>((resume) => {
    const stop = (client: Socket) => {
      clients.add(client);
      client.on("error", () => client.destroy());
      resume(Effect.void);
    };

    server.on("connection", stop);

    return Effect.sync(() => server.off("connection", stop));
  });

  yield* Effect.raceFirst(program, stopped);
}, Effect.scoped);

/** Wait for the supervisor to finish shutting down its children and containers. */
export const stopSession = Effect.fn("Local.stopSession")(function* () {
  const fs = yield* FileSystem.FileSystem;

  if (!(yield* fs.exists(socketPath))) return;

  yield* Effect.callback<void, LocalControlError>((resume) => {
    const client = createConnection(socketPath);

    client.once("error", (cause) => resume(Effect.fail(new LocalControlError({ cause }))));
    client.once("end", () => resume(Effect.void));

    return Effect.sync(() => client.destroy());
  });
});
