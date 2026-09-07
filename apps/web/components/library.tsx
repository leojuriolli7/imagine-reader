"use client";

import type { BookView } from "@imagine/contracts/models";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ArrowUpRight, BookOpen, LogOut, Plus, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu";
import { mutations, queries } from "@/lib/api";
import { authMutations } from "@/lib/auth-options";
import { ThemeMenu } from "./theme-menu";
import { Brand } from "./brand";

export function LibraryView({
  books: initialBooks,
  name,
}: {
  books: readonly BookView[];
  name: string;
}) {
  const router = useRouter();

  const client = useQueryClient();

  const [adding, setAdding] = useState(false);

  const list = useQuery({
    ...queries.list(),
    initialData: initialBooks,
  });

  const books = list.data;

  const uploadMutation = useMutation({
    ...mutations.upload(),
    onSuccess: (book) => router.push(`/read/${book.id}`),
  });

  const removeMutation = useMutation({
    ...mutations.remove(),
    onSuccess: () => client.invalidateQueries(queries.list()),
    onError: (_error, id) =>
      toast.error("Couldn't finish deleting this book.", {
        action: { label: "Retry", onClick: () => removeMutation.mutate(id) },
      }),
  });

  const busy = uploadMutation.isPending;

  const error = uploadMutation.error?.message ?? list.error?.message;

  const upload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    uploadMutation.mutate(new FormData(event.currentTarget));
  };

  const logoutMutation = useMutation({
    ...authMutations.signOut(),
    onSuccess: () => {
      client.clear();

      router.push("/login");

      router.refresh();
    },
  });

  const logout = () => logoutMutation.mutate();

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-5 md:px-12">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeMenu />
          <Button variant="ghost" onClick={logout}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              A quiet place for your next chapter, {name}.
            </p>
            <h1 className="font-serif text-5xl">Your library</h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">
              {books.length} {books.length === 1 ? "book" : "books"}
            </Badge>
            <Dialog
              open={adding}
              onOpenChange={(open) => {
                if (!busy) {
                  setAdding(open);
                  uploadMutation.reset();
                }
              }}
            >
              <DialogTrigger render={<Button />}>
                <Plus />
                Add new book
              </DialogTrigger>
              <DialogContent showCloseButton={!busy}>
                <DialogHeader>
                  <DialogTitle>Add new book</DialogTitle>
                  <DialogDescription>Choose a PDF from your device.</DialogDescription>
                </DialogHeader>
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
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {list.error && (
          <p role="alert" className="mb-4 text-destructive">
            Couldn’t refresh your library. Please try again.
          </p>
        )}
        <div>
          <section className="grid content-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {books.length === 0 && (
              <div className="col-span-full flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
                <BookOpen className="mb-5 size-10 text-muted-foreground" />

                <h2 className="font-serif text-2xl">Every world starts with a page.</h2>

                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Upload your first book and start reading. We'll take care of the visuals.
                </p>
              </div>
            )}
            {[...books].reverse().map((book) => (
              <Card
                key={book.id}
                className="overflow-hidden transition-colors hover:border-primary/40"
              >
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/read/${book.id}`} className="min-w-0 flex-1 hover:underline">
                      <h2 className="break-words font-serif text-xl">{book.title}</h2>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${book.title}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(book.id)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {book.pageCount
                      ? `Page ${book.currentPage} of ${book.pageCount}`
                      : "Ready to open"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
