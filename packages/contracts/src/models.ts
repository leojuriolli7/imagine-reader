import { Schema } from "effect";
import { ArtDirection, BookPage, CharacterAppearance, Page } from "./planning";

export const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200));

/** Display intervals use PDF page numbers and an exclusive end. */
export const Span = Schema.Struct({ start: Page, end: Page, illustrationId: Schema.NullOr(Id) });
export type Span = typeof Span.Type;

export const PipelineConfig = Schema.Struct({
  version: Schema.String,
  mode: Schema.Literals(["demo", "openai"]),
  plannerModel: Schema.String,
  imageModel: Schema.String,
});

export type PipelineConfig = typeof PipelineConfig.Type;

const Artifact = Schema.Struct({
  key: Schema.String,
  mediaType: Schema.String,
  model: Schema.String,
});

export const SavedIllustration = Schema.Struct({
  id: Id,
  prompt: Schema.String,
  sourcePages: Schema.Array(Page),
  revealPage: Page,
  untilPage: Page,
  characters: Schema.Array(CharacterAppearance),
  artifact: Schema.NullOr(Artifact),
});
export type SavedIllustration = typeof SavedIllustration.Type;

export const SavedBatch = Schema.Struct({
  start: Page,
  end: Page,
  sceneIds: Schema.Array(Id),
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
  pages: Schema.Array(BookPage),
  artDirection: Schema.NullOr(ArtDirection),
  characters: Schema.Array(CharacterAppearance),
  summary: Schema.String,
  activeIllustrationId: Schema.NullOr(Id),
  spans: Schema.Array(Span),
  batches: Schema.Array(SavedBatch),
  illustrations: Schema.Array(SavedIllustration),
  config: PipelineConfig,
});

export type Book = typeof Book.Type;

export const JobKind = Schema.Literals(["extract", "art-direction", "plan", "render"]);

export type JobKind = typeof JobKind.Type;

export const JobSpec = Schema.Struct({
  key: Schema.String,
  bookId: Id,
  kind: JobKind,
  ref: Schema.String,
  priority: Schema.Int,
});

export type JobSpec = typeof JobSpec.Type;

const TraceContext = Schema.Struct({
  traceId: Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/)),
  spanId: Schema.String.check(Schema.isPattern(/^[a-f0-9]{16}$/)),
  sampled: Schema.Boolean,
});

export const Job = Schema.Struct({
  ...JobSpec.fields,
  id: Id,
  token: Schema.String,
  traceContext: Schema.NullOr(TraceContext),
  feedback: Schema.NullOr(Schema.String),
  attempts: Schema.Int,
});

export type Job = typeof Job.Type;

export const JobStatus = Schema.Struct({
  kind: JobKind,
  status: Schema.Literals(["queued", "retrying", "running", "done", "failed"]),
  attempts: Schema.Int,
  error: Schema.NullOr(Schema.String),
});

export type JobStatus = typeof JobStatus.Type;

export const WorkflowStage = Schema.Struct({
  kind: JobKind,
  status: Schema.Literals(["waiting", "queued", "running", "retrying", "failed", "completed"]),
});
export type WorkflowStage = typeof WorkflowStage.Type;

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
  artDirection: Schema.NullOr(ArtDirection),
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
  artDirection: book.artDirection,
  spans: book.spans,
  illustrations: book.illustrations.map((i) => ({
    id: i.id,
    ready: i.artifact !== null,
    revealPage: i.revealPage,
  })),
});
