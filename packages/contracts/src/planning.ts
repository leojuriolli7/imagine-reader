import { Schema } from "effect";

export const Page = Schema.Int.check(Schema.isGreaterThan(0));
const Text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(6000));
const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200));

export const BookPage = Schema.Struct({ page: Page, text: Schema.String });
export type BookPage = typeof BookPage.Type;

export const ArtDirection = Schema.Struct({
  title: Schema.NullOr(Name),
  author: Schema.NullOr(Name),
  setting: Text,
  style: Text,
});
export type ArtDirection = typeof ArtDirection.Type;

/** A complete visual snapshot, available only after the specified PDF page. */
export const CharacterUpdate = Schema.Struct({
  name: Name,
  aliases: Schema.Array(Name).check(Schema.isMaxLength(10)),
  appearance: Text,
  design: Schema.String.check(Schema.isMaxLength(2000)),
  clothing: Schema.String.check(Schema.isMaxLength(2000)),
  knownAfterPage: Page,
});
export type CharacterUpdate = typeof CharacterUpdate.Type;

export const CharacterAppearance = Schema.Struct({
  ...CharacterUpdate.fields,
  aliases: Schema.Array(Name),
  characterId: Name,
});
export type CharacterAppearance = typeof CharacterAppearance.Type;

const SceneProposal = Schema.Struct({
  prompt: Text,
  sourcePages: Schema.Array(Page).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  untilPage: Page,
  characters: Schema.Array(Name).check(Schema.isMaxLength(20)),
});

export type SceneProposal = typeof SceneProposal.Type;

/** The LLM proposes content; the application assigns identities and builds display intervals. */
export const ReadingPlan = Schema.Struct({
  scenes: Schema.Array(SceneProposal).check(Schema.isMaxLength(6)),
  carryUntilPage: Schema.NullOr(Page),
  characterUpdates: Schema.Array(CharacterUpdate).check(Schema.isMaxLength(30)),
  summary: Schema.String.check(Schema.isMaxLength(5000)),
});
export type ReadingPlan = typeof ReadingPlan.Type;

export interface PlanningInput {
  readonly start: number;
  readonly end: number;
  readonly pageCount: number;
  readonly pages: readonly BookPage[];
  readonly direction: ArtDirection;
  readonly characters: readonly CharacterAppearance[];
  readonly summary: string;
  readonly activeScene: { readonly prompt: string } | null;
  readonly feedback: string | null;
}

export interface ArtDirectionInput {
  readonly title: string;
  readonly pages: readonly BookPage[];
}
