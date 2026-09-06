import { InvalidInput } from "@imagine/contracts/errors";
import type {
  BatchInput,
  Checkpoint,
  Illustration,
  Passage,
  Plan,
  Span,
  VisualFact,
} from "@imagine/contracts/models";
import { Effect } from "effect";

const requireRule = (condition: boolean, message: string) =>
  condition ? Effect.void : Effect.fail(new InvalidInput({ message }));

/** Small initial batches reduce time to the first image; text is never silently truncated. */
export const prepareBatch = Effect.fn("Planning.prepareBatch")(function* (
  passages: readonly Passage[],
  start: number,
  target: number,
  checkpoint: Checkpoint,
  existingIllustrations: readonly Illustration[],
  style: string,
): Effect.fn.Return<BatchInput, InvalidInput> {
  let end = start;

  let size = 0;

  while (end <= Math.min(target, start + 7)) {
    const length = passages.filter((p) => p.page === end).reduce((n, p) => n + p.text.length, 0);

    if (size + length > 24000) break;

    size += length;

    end++;
  }

  yield* requireRule(end > start, "A PDF page exceeds the planning text budget.");

  return {
    start,
    end,
    passages: passages.filter((p) => p.page >= start && p.page < end),
    checkpoint,
    existingIllustrations,
    style,
  };
});

function sourcePages(ids: readonly string[], input: BatchInput) {
  return Effect.forEach(
    ids,
    Effect.fn(function* (id) {
      const source = input.passages.find((p) => p.id === id);

      if (!source) return yield* new InvalidInput({ message: `Unknown source passage: ${id}` });

      return source.page;
    }),
  );
}

const validateIllustrations = Effect.fn("Planning.validateIllustrations")(function* (
  plan: Plan,
  input: BatchInput,
) {
  const ids = new Set(input.existingIllustrations.map((i) => i.id));

  for (const illustration of plan.illustrations) {
    yield* requireRule(!ids.has(illustration.id), "Duplicate illustration ID");

    ids.add(illustration.id);

    yield* requireRule(illustration.sourcePassageIds.length > 0, "Illustration requires a source");

    yield* requireRule(
      (yield* sourcePages(illustration.sourcePassageIds, input)).every(
        (page) => page < illustration.revealPage,
      ),
      "Image source must precede reveal",
    );

    yield* requireRule(
      illustration.revealPage >= input.start && illustration.revealPage <= input.end,
      "Invalid reveal boundary",
    );
  }
});

const validateSpans = Effect.fn("Planning.validateSpans")(function* (
  plan: Plan,
  input: BatchInput,
) {
  let cursor = input.start;

  const images = [...input.existingIllustrations, ...plan.illustrations];

  for (const span of plan.spans) {
    yield* requireRule(
      span.start === cursor && span.end > span.start && span.end <= input.end,
      "Invalid span coverage",
    );

    if (span.illustrationId !== null) {
      const image = images.find((i) => i.id === span.illustrationId);

      if (!image) return yield* new InvalidInput({ message: "Unknown illustration reference" });

      yield* requireRule(span.start >= image.revealPage, "Display precedes reveal boundary");
    }

    cursor = span.end;
  }

  yield* requireRule(cursor === input.end, "Incomplete span coverage");
});

/** Compare domain values, independent of JSONB key order or source-reference ordering. */
function sameFact(previous: VisualFact, fact: VisualFact): boolean {
  if (previous.description !== fact.description || previous.knownAfterPage !== fact.knownAfterPage)
    return false;

  const previousSources = new Set(previous.sourcePassageIds);

  const sources = new Set(fact.sourcePassageIds);

  return (
    previousSources.size === sources.size && [...sources].every((id) => previousSources.has(id))
  );
}

/** Schema validation belongs at the adapter. These checks enforce source and timeline semantics. */
export const validatePlan = Effect.fn("Planning.validatePlan")(function* (
  plan: Plan,
  input: BatchInput,
) {
  yield* validateIllustrations(plan, input);

  yield* validateSpans(plan, input);

  for (const fact of plan.checkpoint.facts) {
    const inherited = input.checkpoint.facts.some((previous) => sameFact(previous, fact));

    if (inherited) continue;

    yield* requireRule(fact.sourcePassageIds.length > 0, "Fact requires sources");

    yield* requireRule(
      (yield* sourcePages(fact.sourcePassageIds, input)).every(
        (page) => page <= fact.knownAfterPage,
      ),
      "Fact precedes source",
    );

    yield* requireRule(fact.knownAfterPage < input.end, "Future checkpoint fact");
  }

  const active = plan.checkpoint.activeIllustrationId;

  yield* requireRule(
    active === null ||
      [...input.existingIllustrations, ...plan.illustrations].some((i) => i.id === active),
    "Unknown checkpoint illustration",
  );

  return plan;
});

/** A finished image is only eligible inside its planned interval, including when reading backwards. */
export function illustrationAt(spans: readonly Span[], page: number): string | null {
  return spans.find((span) => page >= span.start && page < span.end)?.illustrationId ?? null;
}
