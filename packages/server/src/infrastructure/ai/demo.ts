import type { BatchInput, Plan } from "@imagine/contracts/models";
import { Effect } from "effect";

export const demoPlan = (input: BatchInput): Plan => {
  const source = input.passages.find((p) => p.text.length > 20 && p.page < input.end - 1);

  if (!source)
    return {
      illustrations: [],
      spans: [{ start: input.start, end: input.end, illustrationId: null }],
      checkpoint: { ...input.checkpoint, activeIllustrationId: null },
    };

  const id = `scene-${input.start}`;

  const revealPage = source.page + 1;

  return {
    illustrations: [
      {
        id,
        prompt: "A quiet room in watercolor.",
        reason: "Demo illustration",
        sourcePassageIds: [source.id],
        revealPage,
      },
    ],
    spans: [
      { start: input.start, end: revealPage, illustrationId: null },
      { start: revealPage, end: input.end, illustrationId: id },
    ],
    checkpoint: { summary: "Demo checkpoint", facts: [], activeIllustrationId: id },
  };
};

export const demoImage = Effect.sync(() => ({
  model: "demo-svg",
  mediaType: "image/svg+xml",
  bytes: new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#eee8db"/><circle cx="690" cy="300" r="120" fill="#d0a66d"/><path d="M0 760L300 380L560 720L820 470L1024 790V1024H0Z" fill="#426257"/><path d="M0 850L400 620L760 890L1024 730V1024H0Z" fill="#244a40"/><text x="64" y="960" fill="#eee8db" font-family="sans-serif" font-size="24">DEMO · No AI image generated</text></svg>`,
  ),
}));
