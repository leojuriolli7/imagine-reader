import type { Book, JobKind, JobSpec, JobStatus, WorkflowStage } from "@imagine/contracts/models";

/** Durable graph: extraction → art direction → ordered planning → nearby rendering. */
export class BookWorkflow {
  static readonly planningLane: readonly JobKind[] = ["extract", "art-direction", "plan"];
  static readonly renderingLane: readonly JobKind[] = ["render"];

  static describe(book: Book, jobs: readonly JobStatus[]): WorkflowStage[] {
    const complete = {
      extract: book.status === "ready",
      "art-direction": book.artDirection !== null,
      plan: book.artDirection !== null && book.plannedThrough >= book.targetThrough,
      render:
        book.artDirection !== null &&
        book.plannedThrough >= book.targetThrough &&
        !BookWorkflow.next(book).some((job) => job.kind === "render"),
    } satisfies Record<JobKind, boolean>;

    return [...BookWorkflow.planningLane, ...BookWorkflow.renderingLane].map(
      (kind): WorkflowStage => {
        const related = jobs.filter((job) => job.kind === kind);
        const active = ["failed", "running", "retrying", "queued"] as const;
        const status = active.find((value) => related.some((job) => job.status === value));

        return { kind, status: status ?? (complete[kind] ? "completed" : "waiting") };
      },
    );
  }

  static next(book: Book): JobSpec[] {
    if (book.status !== "ready") return [];

    if (!book.artDirection)
      return [
        {
          key: `art-direction:${book.id}`,
          bookId: book.id,
          kind: "art-direction",
          ref: "",
          priority: 10,
        },
      ];

    const jobs: JobSpec[] = [];
    const start = book.plannedThrough + 1;

    if (start <= book.targetThrough)
      jobs.push({
        key: `plan:${book.id}:${start}`,
        bookId: book.id,
        kind: "plan",
        ref: String(start),
        priority: 20,
      });

    const visible = new Set(
      book.spans
        .filter((span) => span.end > book.currentPage && span.start <= book.currentPage + 12)
        .map((span) => span.illustrationId),
    );

    for (const image of book.illustrations) {
      if (visible.has(image.id) && !image.artifact)
        jobs.push({
          key: `render:${book.id}:${image.id}`,
          bookId: book.id,
          kind: "render",
          ref: image.id,
          priority: Math.max(0, image.revealPage - book.currentPage),
        });
    }

    return jobs;
  }
}
