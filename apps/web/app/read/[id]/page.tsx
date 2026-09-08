import { bookView } from "@imagine/contracts/models";
import { Library } from "@imagine/server/data/library";
import { Authenticator } from "@imagine/server/data/ports";
import { Effect } from "effect";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Reader } from "@/components/reader";
import { server } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const requestHeaders = await headers();

  const data = await server().runtime.runPromise(
    Effect.gen(function* () {
      const auth = yield* Authenticator;

      const identity = yield* auth.identify(requestHeaders);

      if (!identity) return { status: "unauthorized" as const };

      const library = yield* Library;

      return yield* library.owned(identity.id, id).pipe(
        Effect.map((book) => ({ status: "ready" as const, book: bookView(book) })),
        Effect.catchTag("NotFound", () => Effect.succeed({ status: "missing" as const })),
      );
    }),
  );

  if (data.status === "unauthorized") redirect("/login");

  if (data.status === "missing") notFound();

  return <Reader initial={data.book} devMode={process.env.DEV_MODE === "true"} />;
}
