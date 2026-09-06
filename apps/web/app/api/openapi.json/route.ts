import { server } from "@/lib/server";

export const runtime = "nodejs";

export const GET = (request: Request) => server().handler(request);
