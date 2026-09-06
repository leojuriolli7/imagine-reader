import { expect, it } from "vitest";
import { currentImage, validPage } from "./reading";

it("hides future, pending and expired images", () => {
  const book = {
    spans: [{ start: 2, end: 4, illustrationId: "i" }],
    illustrations: [{ id: "i", ready: true, revealPage: 2 }],
  };

  expect(currentImage(book, 1)).toBeNull();

  expect(currentImage(book, 2)?.id).toBe("i");

  expect(currentImage(book, 4)).toBeNull();

  expect(
    currentImage(
      { ...book, illustrations: book.illustrations.map((i) => ({ ...i, ready: false })) },
      2,
    ),
  ).toBeNull();
});

it("clamps page jumps to valid integer bounds", () => {
  expect(validPage(-4, 20)).toBe(1);

  expect(validPage(100, 20)).toBe(20);

  expect(validPage(4.8, 20)).toBe(4);
});
