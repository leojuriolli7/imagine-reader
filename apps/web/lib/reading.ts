import type { BookView } from "@imagine/contracts/models";

export function currentImage(book: Pick<BookView, "spans" | "illustrations">, page: number) {
  const span = book.spans.find((s) => s.start <= page && s.end > page);

  return book.illustrations.find((i) => i.id === span?.illustrationId && i.ready) ?? null;
}

export function validPage(value: number, total: number) {
  return Math.min(Math.max(1, Math.trunc(value) || 1), Math.max(1, total));
}
