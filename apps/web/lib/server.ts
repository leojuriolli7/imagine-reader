import "server-only";
import { createRuntime } from "@imagine/server/main/runtime";

declare global {
  var imagineRuntime: ReturnType<typeof createRuntime> | undefined;
}

export function server(): ReturnType<typeof createRuntime> {
  globalThis.imagineRuntime ??= createRuntime();

  return globalThis.imagineRuntime;
}
