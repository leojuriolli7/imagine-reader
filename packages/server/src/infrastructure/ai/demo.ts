import type {
  ArtDirectionInput,
  ArtDirection,
  PlanningInput,
  ReadingPlan,
} from "@imagine/contracts/planning";
import { Effect } from "effect";

export const demoDirection = (input: ArtDirectionInput): ArtDirection => ({
  title: input.title,
  author: null,
  setting: "Use the setting described in the supplied pages.",
  style: "Illustrated paper collage, warm ochre and forest green, simple silhouettes.",
});

export const demoPlan = (input: PlanningInput): ReadingPlan => {
  const source = input.pages.find((page) => page.text.length > 20 && page.page < input.end - 1);

  return {
    scenes: source
      ? [
          {
            prompt: "A quiet room with a large window overlooking a garden.",
            sourcePages: [source.page],
            untilPage: input.end,
            characters: [],
          },
        ]
      : [],
    carryUntilPage: null,
    characterUpdates: [],
    summary: "Demo reading window.",
  };
};

export const demoImage = Effect.sync(() => ({
  model: "demo-svg",
  mediaType: "image/svg+xml",
  bytes: new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#eee8db"/><circle cx="690" cy="300" r="120" fill="#d0a66d"/><path d="M0 760L300 380L560 720L820 470L1024 790V1024H0Z" fill="#426257"/><path d="M0 850L400 620L760 890L1024 730V1024H0Z" fill="#244a40"/><text x="64" y="960" fill="#eee8db" font-family="sans-serif" font-size="24">DEMO · No AI image generated</text></svg>`,
  ),
}));
