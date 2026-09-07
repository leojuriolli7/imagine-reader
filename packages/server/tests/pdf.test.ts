import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { Extractor } from "../src/data/ports";
import { PdfLive } from "../src/infrastructure/pdf";

it.effect("extracts page-labelled text from a real PDF", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const bytes = yield* fs.readFile(
      fileURLToPath(new URL("./fixtures/story.pdf", import.meta.url)),
    );

    const extractor = yield* Extractor;

    const result = yield* extractor.extract(bytes);

    assert.isAbove(result.pageCount, 0);

    assert.isAbove(result.pages.length, 0);

    assert.isTrue(result.pages.every((p) => p.page >= 1 && p.page <= result.pageCount));
  }).pipe(Effect.provide(PdfLive), Effect.provide(NodeServices.layer)),
);

it.effect("rejects a damaged PDF as a typed input error", () =>
  Effect.gen(function* () {
    const extractor = yield* Extractor;

    const error = yield* extractor.extract(new TextEncoder().encode("not a PDF")).pipe(Effect.flip);

    assert.strictEqual(error._tag, "InvalidInput");
  }).pipe(Effect.provide(PdfLive)),
);
