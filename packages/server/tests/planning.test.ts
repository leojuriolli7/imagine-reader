import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ReadingPlan } from "@imagine/contracts/planning";
import { CharacterMemory } from "../src/domain/character-memory";
import { PlanningWindow } from "../src/domain/planning-window";
import { BookWorkflow } from "../src/domain/book-workflow";
import { planningBook, readingPlan } from "./planning-fixture";

it.effect("compiles page-based proposals into IDs, empty intervals and fixed visual prompts", () =>
  Effect.gen(function* () {
    const window = yield* PlanningWindow.open(planningBook(), null);
    const proposal = yield* Schema.decodeUnknownEffect(ReadingPlan)(readingPlan());
    const result = yield* window.compile(proposal);

    assert.deepStrictEqual(result.spans, [{ start: 1, end: 9, illustrationId: "book:1:0" }]);
    assert.include(result.illustrations[0]?.prompt ?? "", "Ink engraving");
    assert.include(result.illustrations[0]?.prompt ?? "", "Blue coat");
    assert.strictEqual(result.characters.length, 1);
  }),
);

it.effect(
  "keeps later appearance changes out of earlier scenes and resolves established aliases",
  () =>
    Effect.gen(function* () {
      const window = yield* PlanningWindow.open(planningBook(), null);
      const proposal = readingPlan();
      const first = proposal.characterUpdates[0];

      assert.isDefined(first);
      if (!first) return;

      const result = yield* window.compile({
        ...proposal,
        characterUpdates: [
          first,
          {
            ...first,
            name: "Edmond",
            aliases: ["Dantès"],
            clothing: "Red coat",
            knownAfterPage: 5,
          },
        ],
      });
      const memory = new CharacterMemory(result.characters);

      assert.include(result.illustrations[0]?.prompt ?? "", "Blue coat");
      assert.notInclude(result.illustrations[0]?.prompt ?? "", "Red coat");
      assert.strictEqual(memory.at(2)[0]?.clothing, "Blue coat");
      assert.strictEqual(memory.at(6)[0]?.clothing, "Red coat");
      assert.strictEqual(new Set(result.characters.map((value) => value.characterId)).size, 1);
    }),
);

it.effect("reuses stored characters in later windows without requiring copied facts", () =>
  Effect.gen(function* () {
    const book = planningBook();
    const first = yield* (yield* PlanningWindow.open(book, null)).compile(readingPlan());
    const next = yield* PlanningWindow.open({ ...book, ...first, plannedThrough: 8 }, null);
    const result = yield* next.compile({
      scenes: [
        {
          prompt: "Edmond crosses a courtyard",
          characters: ["Edmond"],
          sourcePages: [9],
          untilPage: 17,
        },
      ],
      characterUpdates: [],
      summary: "He crosses a courtyard.",
      carryUntilPage: null,
    });

    assert.include(result.illustrations[0]?.prompt ?? "", "Blue coat");
    assert.strictEqual(result.characters.length, 1);
  }),
);

it.effect.each([
  { sourcePages: [10], untilPage: 9, characters: [] },
  { sourcePages: [1], untilPage: 1, characters: [] },
  { sourcePages: [1], untilPage: 9, characters: ["Unknown person"] },
])("rejects invalid scene decisions %#", (scene) =>
  Effect.gen(function* () {
    const window = yield* PlanningWindow.open(planningBook(), null);
    const error = yield* window
      .compile({ ...readingPlan(), scenes: [{ ...scene, prompt: "A scene" }] })
      .pipe(Effect.flip);

    assert.strictEqual(error._tag, "InvalidPlan");
  }),
);

it.effect("carries a boundary scene without showing it before its sources", () =>
  Effect.gen(function* () {
    const book = planningBook();
    const window = yield* PlanningWindow.open(book, null);
    const result = yield* window.compile({
      ...readingPlan(),
      scenes: [{ prompt: "A quiet room", characters: [], sourcePages: [8], untilPage: 10 }],
    });

    assert.deepStrictEqual(result.spans, [
      { start: 1, end: 8, illustrationId: null },
      { start: 8, end: 9, illustrationId: "book:1:0" },
    ]);

    const next = yield* PlanningWindow.open({ ...book, ...result, plannedThrough: 8 }, null);
    const carried = yield* next.compile({
      scenes: [],
      characterUpdates: [],
      carryUntilPage: 12,
      summary: "The room remains quiet.",
    });

    assert.deepStrictEqual(carried.spans, [
      { start: 9, end: 12, illustrationId: "book:1:0" },
      { start: 12, end: 17, illustrationId: null },
    ]);
  }),
);

it.effect("bounds input without truncating pages and forwards retry feedback", () =>
  Effect.gen(function* () {
    const book = planningBook();
    const window = yield* PlanningWindow.open(book, "Fix the scene end page.");
    const dense = yield* PlanningWindow.open(
      { ...book, pages: book.pages.map((page) => ({ ...page, text: "x".repeat(12000) })) },
      null,
    );

    assert.strictEqual(window.input.end, 9);
    assert.strictEqual(window.input.feedback, "Fix the scene end page.");
    assert.strictEqual(dense.input.end, 3);
    assert.strictEqual(dense.input.pages[0]?.text.length, 12000);
  }),
);

it.effect("rejects future appearances, overlapping scenes and reveals beyond the book", () =>
  Effect.gen(function* () {
    const proposal = readingPlan();
    const window = yield* PlanningWindow.open(planningBook(), null);

    const future = yield* window
      .compile({
        ...proposal,
        characterUpdates: proposal.characterUpdates.map((character) => ({
          ...character,
          knownAfterPage: 5,
        })),
      })
      .pipe(Effect.flip);

    assert.strictEqual(future._tag, "InvalidPlan");

    const overlap = yield* window
      .compile({
        ...proposal,
        scenes: [
          ...proposal.scenes,
          { prompt: "Another view", sourcePages: [3], untilPage: 9, characters: [] },
        ],
      })
      .pipe(Effect.flip);

    assert.include(overlap.message, "preceding scene ends");

    const boundaryOverlap = yield* window
      .compile({
        ...proposal,
        scenes: [
          { prompt: "A final moment", sourcePages: [8], untilPage: 10, characters: [] },
          { prompt: "The same moment", sourcePages: [8], untilPage: 10, characters: [] },
        ],
      })
      .pipe(Effect.flip);

    assert.include(boundaryOverlap.message, "preceding scene ends");

    const finalWindow = yield* PlanningWindow.open(
      { ...planningBook(), pageCount: 8, targetThrough: 8 },
      null,
    );
    const beyond = yield* finalWindow
      .compile({
        ...proposal,
        scenes: [{ prompt: "Too late", sourcePages: [8], untilPage: 10, characters: [] }],
      })
      .pipe(Effect.flip);

    assert.include(beyond.message, "at most 9");

    const finalScene = yield* finalWindow.compile({
      ...proposal,
      scenes: [{ prompt: "Final moment", sourcePages: [7, 8], untilPage: 9, characters: [] }],
    });

    assert.strictEqual(finalScene.illustrations[0]?.revealPage, 8);
    assert.deepStrictEqual(finalScene.spans.at(-1), {
      start: 8,
      end: 9,
      illustrationId: "book:1:0",
    });
  }),
);

it.effect("rejects aliases that would merge different established people", () =>
  Effect.gen(function* () {
    const first = readingPlan().characterUpdates[0];

    assert.isDefined(first);
    if (!first) return;

    const memory = yield* new CharacterMemory([]).append(
      [first, { ...first, name: "Fernand", aliases: [] }],
      "book",
    );
    const error = yield* memory
      .append([{ ...first, aliases: ["Edmond", "Fernand"], knownAfterPage: 2 }], "book")
      .pipe(Effect.flip);

    assert.strictEqual(error._tag, "InvalidPlan");
    assert.strictEqual(memory.at(2).length, 2);
  }),
);

it("schedules art direction before planning and enables nearby rendering independently", () => {
  const book = planningBook();

  assert.deepStrictEqual(
    BookWorkflow.next({ ...book, artDirection: null }).map((job) => job.kind),
    ["art-direction"],
  );
  assert.deepStrictEqual(
    BookWorkflow.next(book).map((job) => job.kind),
    ["plan"],
  );
  assert.deepStrictEqual(BookWorkflow.next({ ...book, status: "extracting" }), []);
});

it.effect.each([1, 10])(
  "ignores invalid optional carry endpoints %s and keeps valid scenes",
  (carryUntilPage) =>
    Effect.gen(function* () {
      const window = yield* PlanningWindow.open(planningBook(), null);
      const result = yield* window.compile({ ...readingPlan(), carryUntilPage });

      assert.strictEqual(result.illustrations.length, 1);
      assert.deepStrictEqual(result.spans, [{ start: 1, end: 9, illustrationId: "book:1:0" }]);
    }),
);

it.effect("drops an overlapping carry without weakening new-scene validation", () =>
  Effect.gen(function* () {
    const book = planningBook();
    const first = yield* (yield* PlanningWindow.open(book, null)).compile(readingPlan());
    const window = yield* PlanningWindow.open({ ...book, ...first, plannedThrough: 8 }, null);
    const scene = { prompt: "A courtyard", sourcePages: [10], untilPage: 17, characters: [] };
    const plan = {
      scenes: [scene],
      carryUntilPage: 12,
      characterUpdates: [],
      summary: "A courtyard",
    };
    const result = yield* window.compile(plan);

    assert.deepStrictEqual(result.spans, [
      { start: 9, end: 10, illustrationId: null },
      { start: 10, end: 17, illustrationId: "book:9:0" },
    ]);
    const invalid = yield* window
      .compile({ ...plan, scenes: [{ ...scene, sourcePages: [40] }] })
      .pipe(Effect.flip);
    assert.strictEqual(invalid._tag, "InvalidPlan");
  }),
);
