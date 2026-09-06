"use client";

import type { BookView } from "@imagine/contracts/models";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Schema } from "effect";
import { ArrowUpRight, BookOpen, LogOut, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent } from "react";
import { keys, queries } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Brand } from "./brand";

export function LibraryView({
  books: initialBooks,
  name,
}: {
  books: readonly BookView[];
  name: string;
}) {
  const router = useRouter();

  const list = useQuery({
    queryKey: keys.library,
    queryFn: ({ signal }) => queries.list(signal),
    initialData: initialBooks,
  });

  const books = list.data;

  const uploadMutation = useMutation({
    mutationFn: (form: FormData) => {
      const file = Schema.decodeUnknownSync(Schema.instanceOf(File))(form.get("file"));

      const title = String(form.get("title") || file.name.replace(/\.pdf$/i, ""));

      return queries.upload(file, title);
    },
    onSuccess: (book) => router.push(`/read/${book.id}`),
  });

  const busy = uploadMutation.isPending;

  const error = uploadMutation.error?.message ?? list.error?.message;

  const upload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    uploadMutation.mutate(new FormData(event.currentTarget));
  };

  const logoutMutation = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      router.push("/login");

      router.refresh();
    },
  });

  const logout = () => logoutMutation.mutate();

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-5 md:px-12">
        <Brand />
        <Button variant="ghost" onClick={logout}>
          <LogOut />
          Sign out
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              A quiet place for your next chapter, {name}.
            </p>
            <h1 className="font-serif text-5xl">Your library</h1>
          </div>
          <Badge variant="outline">
            {books.length} {books.length === 1 ? "book" : "books"}
          </Badge>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="grid content-start gap-5 sm:grid-cols-2">
            {books.length === 0 && (
              <div className="col-span-full flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
                <BookOpen className="mb-5 size-10 text-muted-foreground" />
                <h2 className="font-serif text-2xl">Every world starts with a page.</h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Upload your first book and start reading. We’ll prepare the illustrations as you
                  go.
                </p>
              </div>
            )}
            {[...books].reverse().map((book, index) => (
              <Link key={book.id} href={`/read/${book.id}`} className="group">
                <Card className="overflow-hidden transition-colors hover:border-primary/40">
                  <div
                    className={`flex h-44 items-center justify-center ${index % 2 === 0 ? "bg-emerald-950/90 text-emerald-50" : "bg-stone-700 text-stone-50"}`}
                  >
                    <BookOpen className="size-12 stroke-1 opacity-80" />
                  </div>
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-serif text-xl">{book.title}</h2>
                      <ArrowUpRight className="size-4 shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {book.pageCount
                        ? `Page ${book.currentPage} of ${book.pageCount}`
                        : "Ready to open · preparing illustrations"}
                    </p>
                    {book.mode === "demo" && <Badge variant="secondary">Demo illustrations</Badge>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
          <aside>
            <Card>
              <CardContent className="space-y-5 pt-6">
                <Upload className="size-6" />
                <div>
                  <h2 className="text-lg font-medium">Bring your own book</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Open page one while we plan the next fifty.
                  </p>
                </div>
                <form onSubmit={upload} className="space-y-5">
                  <Field>
                    <FieldLabel htmlFor="file">PDF file</FieldLabel>
                    <Input
                      id="file"
                      name="file"
                      type="file"
                      accept="application/pdf"
                      required
                      disabled={busy}
                    />
                    <FieldDescription>
                      Selectable text · up to 25 MB and 2,000 pages.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="title">
                      Book title{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id="title"
                      name="title"
                      maxLength={200}
                      placeholder="Use the file name"
                      disabled={busy}
                    />
                  </Field>
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <Button className="w-full" type="submit" disabled={busy}>
                    {busy ? "Uploading your book…" : "Upload & start reading"}
                    <ArrowUpRight />
                  </Button>
                </form>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your library is private. In AI mode, relevant book passages are sent to the
                  configured AI provider.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </>
  );
}
