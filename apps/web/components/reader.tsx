"use client";

import type { BookView } from "@imagine/contracts/models";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mutations, queries } from "@/lib/api";
import { currentImage, validPage } from "@/lib/reading";
import { IllustrationViewer } from "./illustration-viewer";
import { ThemeMenu } from "./theme-menu";

const PdfPage = dynamic(() => import("./pdf-page"), { ssr: false });

export function Reader({ initial, devMode }: { initial: BookView; devMode: boolean }) {
  const client = useQueryClient();

  const bookQuery = useQuery({
    ...queries.book(initial.id),
    initialData: initial,
    refetchInterval: 2000,
  });

  const jobsQuery = useQuery({
    ...queries.jobs(initial.id),
    refetchInterval: 2000,
  });

  const book = bookQuery.data;

  const jobs = jobsQuery.data ?? [];

  const [page, setPage] = useState(initial.currentPage);

  const [pages, setPages] = useState(initial.pageCount);

  const onLoaded = useCallback((count: number) => setPages(count), []);

  const progress = useMutation(mutations.progress(initial.id));

  const { mutate: saveProgress } = progress;

  useEffect(() => {
    if (book.status !== "ready") return;

    const timer = setTimeout(() => saveProgress(page), 3000);

    return () => clearTimeout(timer);
  }, [page, book.status, saveProgress]);

  const retryMutation = useMutation({
    ...mutations.retry(initial.id),
    onSuccess: () => client.invalidateQueries(queries.jobs(initial.id)),
  });

  const { mutate: retry } = retryMutation;

  const error =
    bookQuery.error?.message ??
    jobsQuery.error?.message ??
    progress.error?.message ??
    retryMutation.error?.message;

  const progressFailed = progress.isError;

  const retryFailed = retryMutation.isError;

  const image = currentImage(book, page);

  const failed = jobs.find((job) => job.status === "failed");

  const retrying = jobs.some((job) => job.status === "retrying");

  const hasFailed = failed !== undefined;

  const lastError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!hasFailed) return;

    const id = toast.error("Some pages couldn't be processed.", {
      id: `processing:${initial.id}`,
      duration: Infinity,
      action: { label: "Retry", onClick: () => retry() },
    });

    return () => {
      toast.dismiss(id);
    };
  }, [hasFailed, initial.id, retry]);

  useEffect(() => {
    if (!error || lastError.current === error) {
      lastError.current = error;

      return;
    }

    lastError.current = error;

    toast.error("Couldn't save or refresh your reading session.", {
      id: `reader:${initial.id}`,
      action: {
        label: "Retry",
        onClick: () => {
          lastError.current = undefined;
          if (progressFailed) saveProgress(page);

          if (retryFailed) retry();
          void client.invalidateQueries(queries.book(initial.id));
          void client.invalidateQueries(queries.jobs(initial.id));
        },
      },
    });
  }, [error, initial.id, page, saveProgress, client, progressFailed, retryFailed, retry]);

  return (
    <div className="min-h-dvh flex flex-col bg-muted/30">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-background px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/library" aria-label="Back to library">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="max-w-80 truncate font-serif text-xl">{book.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {devMode && (
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
          )}

          <ThemeMenu />
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-[792px] flex-1 flex-col gap-6 px-4 py-6 min-[1440px]:max-w-[672px]">
        <section className="min-w-0 flex-1">
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
          <div className="mx-auto max-w-[760px] overflow-hidden rounded-sm bg-background shadow-sm">
            <PdfPage id={book.id} page={page} onLoaded={onLoaded} />
          </div>
        </section>

        {image && (
          <aside
            aria-label="Scene illustration"
            className="w-full min-[1440px]:absolute min-[1440px]:left-full min-[1440px]:top-[84px] min-[1440px]:bottom-6 min-[1440px]:w-[min(360px,calc((100vw-672px)/2-24px))]"
          >
            <div className="min-[1440px]:sticky min-[1440px]:top-6">
              <IllustrationViewer
                key={image.id}
                src={`/api/books/${book.id}/images/${encodeURIComponent(image.id)}`}
              />
            </div>
          </aside>
        )}
        {devMode && (
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
              </div>
            )}

            {error && <p role="alert">{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
