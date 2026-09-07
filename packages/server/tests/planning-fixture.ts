import type { Book } from "@imagine/contracts/models";
import type { ReadingPlan } from "@imagine/contracts/planning";

export const planningBook = (): Book => ({
  id: "book",
  ownerId: "reader",
  title: "A novel",
  storageKey: "books/book/original.pdf",
  createdAt: "2026-09-06T00:00:00.000Z",
  status: "ready",
  error: null,
  pageCount: 50,
  currentPage: 1,
  targetThrough: 50,
  plannedThrough: 0,
  config: { version: "1", mode: "demo", plannerModel: "demo", imageModel: "demo" },
  pages: Array.from({ length: 50 }, (_, index) => ({
    page: index + 1,
    text: "A young sailor enters a quiet room with a garden window.",
  })),
  artDirection: { title: null, author: null, setting: "A coastal town", style: "Ink engraving" },
  characters: [],
  summary: "",
  activeIllustrationId: null,
  spans: [],
  batches: [],
  illustrations: [],
});

export const readingPlan = (): ReadingPlan => ({
  scenes: [
    {
      prompt: "A sailor beside the window",
      sourcePages: [1],
      untilPage: 9,
      characters: ["Dantès"],
    },
  ],
  carryUntilPage: null,
  characterUpdates: [
    {
      name: "Dantès",
      aliases: ["Edmond"],
      appearance: "A young sailor with dark hair",
      design: "Angular face",
      clothing: "Blue coat",
      knownAfterPage: 1,
    },
  ],
  summary: "The sailor enters the room.",
});
