import { Authenticator } from "@imagine/server/data/ports";
import { Effect } from "effect";
import { server } from "@/lib/server";

export const runtime = "nodejs";

const handle = (request: Request) =>
  server().runtime.runPromise(Effect.flatMap(Authenticator, (auth) => auth.handler(request)));

export const GET = handle;

export const POST = handle;
