import { server } from "@/lib/server";

export const runtime = "nodejs";

export const GET = (request: Request) => server().handler(request);

export const POST = (request: Request) => server().handler(request);

export const DELETE = (request: Request) => server().handler(request);
