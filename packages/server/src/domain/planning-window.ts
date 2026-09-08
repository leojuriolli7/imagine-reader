import { InvalidInput, Conflict } from "@imagine/contracts/errors";
import type { Book, SavedIllustration, Span } from "@imagine/contracts/models";
import type { PlanningInput, ReadingPlan, SceneProposal } from "@imagine/contracts/planning";
import { Effect } from "effect";
import { CharacterMemory } from "./character-memory";
import { InvalidPlan } from "./errors";

/** Owns window bounds, visual memory, and deterministic conversion of proposals into a timeline. */
export class PlanningWindow {
  private constructor(
    readonly input: PlanningInput,
    private readonly book: Book,
  ) {}

  static open = Effect.fn("PlanningWindow.open")(function* (book: Book, feedback: string | null) {
    if (!book.artDirection) return yield* new Conflict({ message: "Art direction is not ready." });

    const start = book.plannedThrough + 1;
    let end = start;
    let length = 0;

    while (end <= Math.min(book.targetThrough, book.pageCount, start + 7)) {
      const page = book.pages.find((value) => value.page === end);

      if (length + (page?.text.length ?? 0) > 24000) break;

      length += page?.text.length ?? 0;
      end++;
    }

    if (end === start)
      return yield* new InvalidInput({ message: "A PDF page exceeds the planning text budget." });

    const active = book.illustrations.find((image) => image.id === book.activeIllustrationId);

    return new PlanningWindow(
      {
        start,
        end,
        pageCount: book.pageCount,
        pages: book.pages.filter((page) => page.page >= start && page.page < end),
        direction: book.artDirection,
        characters: new CharacterMemory(book.characters).at(start - 1),
        summary: book.summary,
        activeScene: active ? { prompt: active.prompt } : null,
        feedback,
      },
      book,
    );
  });

  private validateScene = Effect.fn("PlanningWindow.validateScene")(function* (
    this: PlanningWindow,
    scene: SceneProposal,
    index: number,
    cursor: number,
    pages: ReadonlySet<number>,
  ) {
    if (scene.sourcePages.some((page) => !pages.has(page)))
      return yield* new InvalidPlan({
        message: `Scene ${index + 1}: sourcePages must come from supplied nonempty pages ${this.input.start}–${this.input.end - 1}. Received ${scene.sourcePages.join(", ")}.`,
      });

    const revealPage = Math.max(...scene.sourcePages);
    const maximumEnd = Math.min(this.input.end + 1, this.book.pageCount + 1);

    if (revealPage < cursor)
      return yield* new InvalidPlan({
        message: `Scene ${index + 1} reveals on page ${revealPage}, before the preceding scene ends on page ${cursor}. Shorten the preceding interval or combine the scenes.`,
      });

    if (scene.untilPage <= revealPage || scene.untilPage > maximumEnd)
      return yield* new InvalidPlan({
        message: `Scene ${index + 1} reveals on page ${revealPage} (max sourcePages). untilPage was ${scene.untilPage}; it must be greater than ${revealPage} and at most ${maximumEnd}. Omit a scene that has no display interval.`,
      });

    return revealPage;
  });

  compile = Effect.fn("PlanningWindow.compile")(function* (
    this: PlanningWindow,
    plan: ReadingPlan,
  ) {
    const { start, end, direction } = this.input;
    const pages = new Set(
      this.input.pages.filter((page) => page.text.trim()).map((page) => page.page),
    );

    for (const update of plan.characterUpdates) {
      if (!pages.has(update.knownAfterPage))
        return yield* new InvalidPlan({
          message: `Character update must use a supplied page: ${update.knownAfterPage}`,
        });
    }

    const memory = yield* new CharacterMemory(this.book.characters).append(
      plan.characterUpdates,
      this.book.id,
    );
    const illustrations: SavedIllustration[] = [];
    const spans: Span[] = [];
    let cursor = start;

    if (plan.carryUntilPage !== null) {
      const active = this.book.illustrations.find(
        (image) => image.id === this.book.activeIllustrationId,
      );

      if (
        !active ||
        active.revealPage > start ||
        plan.carryUntilPage <= start ||
        plan.carryUntilPage > end
      )
        return yield* new InvalidPlan({
          message: "The carried scene must be available and end inside this window.",
        });

      spans.push({ start, end: plan.carryUntilPage, illustrationId: active.id });
      cursor = plan.carryUntilPage;
    }

    for (const [index, scene] of plan.scenes.entries()) {
      const revealPage = yield* this.validateScene(scene, index, cursor, pages);
      const knownAfterPage = revealPage;

      const characters = yield* memory.resolve(scene.characters, knownAfterPage);
      const id = `${this.book.id}:${start}:${index}`;
      const prompt = [
        `Art direction: ${direction.style}`,
        `Setting: ${direction.setting}`,
        `Scene: ${scene.prompt}`,
        ...characters.map(
          (character) =>
            `${character.name}: ${character.appearance}\nDesign choices: ${character.design}\nClothing: ${character.clothing}`,
        ),
        "No text, lettering, or watermarks.",
      ].join("\n\n");

      illustrations.push({
        id,
        prompt,
        characters,
        sourcePages: scene.sourcePages,
        revealPage,
        untilPage: scene.untilPage,
        artifact: null,
      });

      if (cursor < revealPage) spans.push({ start: cursor, end: revealPage, illustrationId: null });
      if (revealPage < end)
        spans.push({ start: revealPage, end: Math.min(scene.untilPage, end), illustrationId: id });

      cursor = scene.untilPage;
    }

    if (cursor < end) spans.push({ start: cursor, end, illustrationId: null });

    const last = illustrations.at(-1);
    const activeIllustrationId =
      last && last.untilPage >= end
        ? last.id
        : plan.carryUntilPage === end
          ? this.book.activeIllustrationId
          : null;

    return {
      illustrations,
      spans,
      characters: memory.history,
      summary: plan.summary,
      activeIllustrationId,
    };
  });
}
