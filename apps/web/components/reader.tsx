"use client";

import type { BookView } from "@imagine/contracts/models";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { keys, queries } from "@/lib/api";
import { currentImage, validPage } from "@/lib/reading";

const PdfPage = dynamic(() => import("./pdf-page"), { ssr: false });

export function Reader({ initial }: { initial: BookView }) {
  const client = useQueryClient();

  const bookQuery = useQuery({
    queryKey: keys.book(initial.id),
    queryFn: ({ signal }) => queries.book(initial.id, signal),
    initialData: initial,
    refetchInterval: 2000,
  });

  const jobsQuery = useQuery({
    queryKey: keys.jobs(initial.id),
    queryFn: ({ signal }) => queries.jobs(initial.id, signal),
    refetchInterval: 2000,
  });

  const book = bookQuery.data;

  const jobs = jobsQuery.data ?? [];

  const [page, setPage] = useState(initial.currentPage);

  const [pages, setPages] = useState(initial.pageCount);

  const onLoaded = useCallback((count: number) => setPages(count), []);

  const progress = useMutation({
    mutationFn: (page: number) => queries.progress(initial.id, page),
    scope: { id: `progress:${initial.id}` },
  });

  const { mutate: saveProgress } = progress;

  useEffect(() => {
    if (book.status !== "ready") return;

    const timer = setTimeout(() => saveProgress(page), 250);

    return () => clearTimeout(timer);
  }, [page, book.status, saveProgress]);

  const retryMutation = useMutation({
    mutationFn: () => queries.retry(initial.id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs(initial.id) }),
  });

  const retry = () => retryMutation.mutate();

  const error =
    bookQuery.error?.message ??
    jobsQuery.error?.message ??
    progress.error?.message ??
    retryMutation.error?.message;

  const image = currentImage(book, page);

  const failed = jobs.find((job) => job.status === "failed");

  const retrying = jobs.some((job) => job.status === "retrying");

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-background px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/library" aria-label="Back to library">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="max-w-80 truncate font-serif text-xl">{book.title}</h1>
            <p className="text-xs text-muted-foreground">Your place, your pace.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {book.mode === "demo" && <Badge variant="secondary">Demo mode</Badge>}
          <Link
            className="text-xs text-muted-foreground underline"
            href={`/api/books/${book.id}/inspect`}
            target="_blank"
          >
            Inspect plan
          </Link>
        </div>
      </header>
      <main className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-4 py-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.8fr)]">
        <section className="min-w-0">
          <nav className="mb-5 flex items-center justify-center gap-3" aria-label="Page navigation">
            <Button
              size="icon"
              variant="outline"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <label htmlFor="reader-page" className="flex items-center gap-2 text-sm">
              Page
              <Input
                id="reader-page"
                aria-label="Page number"
                className="w-20 text-center"
                type="number"
                min={1}
                max={pages || 1}
                value={page}
                onChange={(event) => setPage(validPage(Number(event.target.value), pages))}
              />
              <span className="text-muted-foreground">of {pages || "…"}</span>
            </label>
            <Button
              size="icon"
              variant="outline"
              aria-label="Next page"
              disabled={!pages || page >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </nav>
          <div className="mx-auto max-w-[760px] overflow-hidden rounded-sm bg-white shadow-sm">
            <PdfPage id={book.id} page={page} onLoaded={onLoaded} />
          </div>
        </section>
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <div className="mb-5 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest">
              <Sparkles className="size-4" />
              The world of your story
            </p>
          </div>
          {image ? (
            <div className="overflow-hidden rounded-2xl border bg-background">
              <Image
                width={1024}
                height={1024}
                unoptimized
                key={image.id}
                src={`/api/books/${book.id}/images/${encodeURIComponent(image.id)}`}
                alt="Illustration of the current scene in your book"
                className="aspect-square w-full object-cover"
              />

              {book.mode === "demo" && (
                <p className="px-5 py-4 text-xs text-muted-foreground">
                  Demo fixture · no AI image generated
                </p>
              )}
            </div>
          ) : (
            <div className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-dashed bg-background/60 p-10 text-center">
              <Sparkles className="mb-5 size-8 text-muted-foreground/60" />
              <h2 className="font-serif text-2xl">Room for your imagination.</h2>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Illustrations appear when the story calls for them. Keep reading while we prepare
                what’s ahead.
              </p>
            </div>
          )}
          <div className="mt-5 space-y-3 text-xs text-muted-foreground" aria-live="polite">
            <p>
              {book.status === "extracting"
                ? "Finding the words in your PDF…"
                : !book.artDirection
                  ? "Choosing an illustration style for this book…"
                  : `Planned through page ${book.plannedThrough} · reading ahead to ${book.targetThrough}`}
            </p>
            {retrying && <p>Processing hit a temporary problem. Retrying automatically…</p>}
            {book.artDirection && (
              <details>
                <summary className="cursor-pointer">This book’s art direction</summary>
                <p className="mt-2 leading-relaxed">{book.artDirection.style}</p>
              </details>
            )}
            {failed && (
              <div className="rounded-xl border bg-background p-4">
                <p className="mb-3">
                  {failed.error ?? "Illustration processing needs another try."}
                </p>
                <Button size="sm" variant="outline" onClick={retry}>
                  Retry processing
                </Button>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        </aside>
      </main>
    </div>
  );
}
