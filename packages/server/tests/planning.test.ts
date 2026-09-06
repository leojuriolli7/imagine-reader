import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { Plan, type BatchInput } from "@imagine/contracts/models";
import { prepareBatch, validatePlan, illustrationAt } from "../src/domain/planning";
import { demoPlan } from "../src/infrastructure/ai/demo";

const input: BatchInput = {
  start: 9,
  end: 17,
  passages: [
    { id: "p9", page: 9, text: "A quiet room, with a large window opening onto a garden." },
  ],
  checkpoint: {
    summary: "",
    facts: [{ description: "Blue coat", knownAfterPage: 1, sourcePassageIds: ["p1", "p2"] }],
    activeIllustrationId: null,
  },
  existingIllustrations: [],
  style: "watercolor",
};

const emptyPlan = (): Plan => ({
  illustrations: [],
  spans: [{ start: 9, end: 17, illustrationId: null }],
  checkpoint: input.checkpoint,
});

describe("planning rules", () => {
  it.effect("carries established facts by value through schema decoding", () =>
    Effect.gen(function* () {
      const plan = yield* Schema.decodeUnknownEffect(Plan)(emptyPlan());

      assert.deepStrictEqual(yield* validatePlan(plan, input), plan);

      const fact = plan.checkpoint.facts[0];

      assert.isDefined(fact);

      if (!fact) return;

      yield* validatePlan(
        {
          ...plan,
          checkpoint: {
            ...plan.checkpoint,
            facts: [{ ...fact, sourcePassageIds: [...fact.sourcePassageIds].reverse() }],
          },
        },
        input,
      );
    }),
  );

  it.effect("rejects facts whose contents change without new evidence", () =>
    Effect.gen(function* () {
      const plan = emptyPlan();

      const modified = {
        ...plan,
        checkpoint: {
          ...plan.checkpoint,
          facts: [{ description: "Red coat", knownAfterPage: 1, sourcePassageIds: ["p1"] }],
        },
      };

      const error = yield* validatePlan(modified, input).pipe(Effect.flip);

      assert.strictEqual(error._tag, "InvalidInput");
    }),
  );

  it.effect("rejects sources not established before an illustration is shown", () =>
    Effect.gen(function* () {
      const plan = demoPlan(input);

      const bad = {
        ...plan,
        illustrations: plan.illustrations.map((i) => ({ ...i, revealPage: 9 })),
      };

      assert.strictEqual((yield* validatePlan(bad, input).pipe(Effect.flip))._tag, "InvalidInput");
    }),
  );

  it.effect("requires exact continuous coverage", () =>
    Effect.gen(function* () {
      const bad = { ...emptyPlan(), spans: [{ start: 10, end: 17, illustrationId: null }] };

      assert.strictEqual((yield* validatePlan(bad, input).pipe(Effect.flip))._tag, "InvalidInput");
    }),
  );

  it.effect("bounds each batch without truncating source text", () =>
    Effect.gen(function* () {
      const passages = Array.from({ length: 50 }, (_, index) => ({
        id: `p${index + 1}`,
        page: index + 1,
        text: "book text",
      }));

      const batch = yield* prepareBatch(
        passages,
        1,
        50,
        { summary: "", facts: [], activeIllustrationId: null },
        [],
        "s",
      );

      assert.strictEqual(batch.end, 9);

      assert.strictEqual(batch.passages.length, 8);

      const dense = passages.map((p) => ({ ...p, text: "x".repeat(12000) }));

      assert.strictEqual((yield* prepareBatch(dense, 1, 50, input.checkpoint, [], "s")).end, 3);
    }),
  );

  it("uses half-open image intervals", () => {
    assert.strictEqual(illustrationAt([{ start: 2, end: 4, illustrationId: "i" }], 4), null);

    assert.strictEqual(illustrationAt([{ start: 2, end: 4, illustrationId: "i" }], 2), "i");
  });
});
