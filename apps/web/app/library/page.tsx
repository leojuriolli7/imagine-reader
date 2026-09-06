import { bookView } from "@imagine/contracts/models";
import { Library } from "@imagine/server/data/library";
import { Authenticator } from "@imagine/server/data/ports";
import { Effect } from "effect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/library";
import { server } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const requestHeaders = await headers();

  const data = await server().runtime.runPromise(
    Effect.gen(function* () {
      const auth = yield* Authenticator;

      const identity = yield* auth.identify(requestHeaders);

      if (!identity) return null;

      const library = yield* Library;

      return { identity, books: (yield* library.list(identity.id)).map(bookView) };
    }),
  );

  if (!data) redirect("/login");

  return <LibraryView books={data.books} name={data.identity.name} />;
}
