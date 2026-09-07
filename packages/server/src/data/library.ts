import { ObjectPublication } from "./object-publication";
import { InvalidInput, NotFound } from "@imagine/contracts/errors";
import type { Book, PipelineConfig } from "@imagine/contracts/models";
import { Context, Crypto, DateTime, Effect, Layer } from "effect";
import { BookWorkflow } from "../domain/book-workflow";
import { BlobStorage, BookRepository, JobQueue, ReaderSettings } from "./ports";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const newBook = (
  id: string,
  ownerId: string,
  title: string,
  config: PipelineConfig,
  createdAt: string,
): Book => ({
  id,
  ownerId,
  title,
  config,
  createdAt,
  storageKey: `books/${id}/original.pdf`,
  status: "extracting",
  error: null,
  pageCount: 0,
  currentPage: 1,
  targetThrough: 50,
  plannedThrough: 0,
  pages: [],
  artDirection: null,
  characters: [],
  summary: "",
  activeIllustrationId: null,
  spans: [],
  batches: [],
  illustrations: [],
});

const library = Effect.gen(function* () {
  const publication = yield* ObjectPublication;

  const crypto = yield* Crypto.Crypto;

  const books = yield* BookRepository;

  const storage = yield* BlobStorage;

  const queue = yield* JobQueue;

  const config = yield* ReaderSettings;

  const owned = Effect.fn("Library.owned")(function* (owner: string, id: string) {
    const book = yield* books.get(id);

    if (!book || book.ownerId !== owner) return yield* new NotFound({ message: "Book not found." });

    return book;
  });

  const upload = Effect.fn("Library.upload")(function* (
    owner: string,
    title: string,
    bytes: Uint8Array,
  ) {
    if (bytes.length > MAX_PDF_BYTES)
      return yield* new InvalidInput({ message: "PDF limit is 25 MB." });

    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      return yield* new InvalidInput({ message: "Upload a valid PDF." });

    const now = yield* DateTime.now;

    const book = newBook(
      yield* crypto.randomUUIDv4.pipe(Effect.orDie),
      owner,
      title,
      config,
      DateTime.formatIso(now),
    );

    yield* publication.publish(
      { key: book.storageKey, bytes, mediaType: "application/pdf" },
      books.create(book, [
        { key: `extract:${book.id}`, bookId: book.id, kind: "extract", ref: "", priority: 0 },
      ]),
    );

    return book;
  });

  const progress = Effect.fn("Library.progress")(function* (
    owner: string,
    id: string,
    page: number,
  ) {
    yield* owned(owner, id);

    yield* books.change(
      id,
      Effect.fn(function* (book) {
        if (!Number.isInteger(page) || page < 1 || page > Math.max(1, book.pageCount))
          return yield* new InvalidInput({ message: "Page is outside this book." });

        const target = Math.max(book.targetThrough, page + 49);

        const updated = {
          ...book,
          currentPage: page,
          targetThrough: book.pageCount > 0 ? Math.min(book.pageCount, target) : target,
        };

        return { book: updated, jobs: BookWorkflow.next(updated) };
      }),
    );
  });

  const remove = Effect.fn("Library.remove")(function* (owner: string, id: string) {
    const book = yield* books.beginDeletion(owner, id);

    // Missing and foreign books both succeed without revealing ownership.
    if (!book) return;

    const keys = [
      book.storageKey,
      ...book.illustrations.flatMap((image) => (image.artifact ? [image.artifact.key] : [])),
    ];

    yield* Effect.forEach(keys, (key) => storage.remove(key), { concurrency: 4 });

    yield* books.finishDeletion(owner, id);
  });

  const retry = Effect.fn("Library.retry")(function* (owner: string, id: string) {
    yield* owned(owner, id);

    yield* queue.retry(id);
  });

  const jobs = Effect.fn("Library.jobs")(function* (owner: string, id: string) {
    yield* owned(owner, id);

    return yield* queue.status(id);
  });

  const file = Effect.fn("Library.file")(function* (owner: string, id: string) {
    const book = yield* owned(owner, id);

    return yield* storage.get(book.storageKey);
  });

  const image = Effect.fn("Library.image")(function* (owner: string, id: string, imageId: string) {
    const book = yield* owned(owner, id);

    const image = book.illustrations.find((i) => i.id === imageId);

    if (!image?.artifact) return yield* new NotFound({ message: "Image is not ready." });

    return { bytes: yield* storage.get(image.artifact.key), mediaType: image.artifact.mediaType };
  });

  return { owned, upload, progress, remove, retry, jobs, file, image, list: books.list };
});

export class Library extends Context.Service<Library, Effect.Success<typeof library>>()(
  "imagine/Library",
) {
  static readonly layer = Layer.effect(Library, library);
}
