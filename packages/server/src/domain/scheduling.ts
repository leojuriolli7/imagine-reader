import type { Book, JobSpec } from "@imagine/contracts/models";

export function planJob(book: Book): JobSpec[] {
  if (book.status !== "ready" || book.plannedThrough >= book.targetThrough) return [];

  const start = book.plannedThrough + 1;

  return [
    {
      key: `plan:${book.id}:${start}`,
      bookId: book.id,
      kind: "plan",
      ref: String(start),
      priority: 20,
    },
  ];
}

/** Render only illustrations intersecting the near-reader buffer, including a carried image. */
export function renderJobs(book: Book): JobSpec[] {
  const spans = book.batches
    .flatMap((batch) => batch.plan.spans)
    .filter((span) => span.end > book.currentPage && span.start <= book.currentPage + 12);

  const ids = new Set(spans.map((span) => span.illustrationId));

  return book.illustrations
    .filter((i) => ids.has(i.id) && !i.artifact)
    .map((i) => ({
      key: `render:${book.id}:${i.id}`,
      bookId: book.id,
      kind: "render",
      ref: i.id,
      priority: Math.max(0, i.revealPage - book.currentPage),
    }));
}
