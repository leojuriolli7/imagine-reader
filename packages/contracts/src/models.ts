import { Schema } from "effect";

export const Page = Schema.Int.check(Schema.isGreaterThan(0));

export const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200));

export const Passage = Schema.Struct({ id: Id, page: Page, text: Schema.String });

export type Passage = typeof Passage.Type;

export const VisualFact = Schema.Struct({
  description: Schema.String.check(Schema.isMaxLength(500)),
  sourcePassageIds: Schema.Array(Id).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
  knownAfterPage: Page,
});

export type VisualFact = typeof VisualFact.Type;

export const Checkpoint = Schema.Struct({
  summary: Schema.String.check(Schema.isMaxLength(5000)),
  facts: Schema.Array(VisualFact).check(Schema.isMaxLength(40)),
  activeIllustrationId: Schema.NullOr(Id),
});

export type Checkpoint = typeof Checkpoint.Type;

export const Illustration = Schema.Struct({
  id: Id,
  prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(6000)),
  reason: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
  sourcePassageIds: Schema.Array(Id).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  revealPage: Page,
});

export type Illustration = typeof Illustration.Type;

/** All timeline ranges are one-based and half-open: [start, end). */
export const Span = Schema.Struct({ start: Page, end: Page, illustrationId: Schema.NullOr(Id) });

export type Span = typeof Span.Type;

export const Plan = Schema.Struct({
  illustrations: Schema.Array(Illustration).check(Schema.isMaxLength(6)),
  spans: Schema.Array(Span).check(Schema.isMinLength(1), Schema.isMaxLength(30)),
  checkpoint: Checkpoint,
});

export type Plan = typeof Plan.Type;

export const PipelineConfig = Schema.Struct({
  version: Schema.String,
  mode: Schema.Literals(["demo", "openai"]),
  style: Schema.String,
  plannerModel: Schema.String,
  imageModel: Schema.String,
});

export type PipelineConfig = typeof PipelineConfig.Type;

export const Artifact = Schema.Struct({
  key: Schema.String,
  mediaType: Schema.String,
  model: Schema.String,
});

export const SavedIllustration = Schema.Struct({
  ...Illustration.fields,
  artifact: Schema.NullOr(Artifact),
});

export const SavedBatch = Schema.Struct({
  start: Page,
  end: Page,
  plan: Plan,
  durationMs: Schema.Number,
});

export const Book = Schema.Struct({
  id: Id,
  ownerId: Id,
  title: Schema.String,
  storageKey: Schema.String,
  createdAt: Schema.String,
  status: Schema.Literals(["extracting", "ready", "failed"]),
  error: Schema.NullOr(Schema.String),
  pageCount: Schema.Int,
  currentPage: Page,
  targetThrough: Schema.Int,
  plannedThrough: Schema.Int,
  passages: Schema.Array(Passage),
  checkpoint: Checkpoint,
  batches: Schema.Array(SavedBatch),
  illustrations: Schema.Array(SavedIllustration),
  config: PipelineConfig,
});

export type Book = typeof Book.Type;

export interface BatchInput {
  readonly start: number;
  readonly end: number;
  readonly passages: readonly Passage[];
  readonly checkpoint: Checkpoint;
  readonly existingIllustrations: readonly Illustration[];
  readonly style: string;
}

export const JobKind = Schema.Literals(["extract", "plan", "render"]);

export type JobKind = typeof JobKind.Type;

export const JobSpec = Schema.Struct({
  key: Schema.String,
  bookId: Id,
  kind: JobKind,
  ref: Schema.String,
  priority: Schema.Int,
});

export type JobSpec = typeof JobSpec.Type;

export const TraceContext = Schema.Struct({
  traceId: Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/)),
  spanId: Schema.String.check(Schema.isPattern(/^[a-f0-9]{16}$/)),
  sampled: Schema.Boolean,
});

export const Job = Schema.Struct({
  ...JobSpec.fields,
  id: Id,
  token: Schema.String,
  traceContext: Schema.NullOr(TraceContext),
  attempts: Schema.Int,
});

export type Job = typeof Job.Type;

export const JobStatus = Schema.Struct({
  kind: JobKind,
  status: Schema.Literals(["queued", "running", "done", "failed"]),
  attempts: Schema.Int,
  error: Schema.NullOr(Schema.String),
});

export type JobStatus = typeof JobStatus.Type;

export const Identity = Schema.Struct({ id: Id, name: Schema.String, email: Schema.String });

export type Identity = typeof Identity.Type;

export const BookView = Schema.Struct({
  id: Id,
  title: Schema.String,
  createdAt: Schema.String,
  status: Book.fields.status,
  pageCount: Schema.Int,
  currentPage: Page,
  plannedThrough: Schema.Int,
  targetThrough: Schema.Int,
  mode: PipelineConfig.fields.mode,
  spans: Schema.Array(Span),
  illustrations: Schema.Array(Schema.Struct({ id: Id, ready: Schema.Boolean, revealPage: Page })),
});

export type BookView = typeof BookView.Type;

export const bookView = (book: Book): BookView => ({
  id: book.id,
  title: book.title,
  createdAt: book.createdAt,
  status: book.status,
  pageCount: book.pageCount,
  currentPage: book.currentPage,
  plannedThrough: book.plannedThrough,
  targetThrough: book.targetThrough,
  mode: book.config.mode,
  spans: book.batches.flatMap((b) => b.plan.spans),
  illustrations: book.illustrations.map((i) => ({
    id: i.id,
    ready: i.artifact !== null,
    revealPage: i.revealPage,
  })),
});
