import { InvalidInput } from "@imagine/contracts/errors";
import type { BookPage } from "@imagine/contracts/planning";
import { Effect, Layer } from "effect";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Extractor } from "../data/ports";

export const PdfLive = Layer.succeed(
  Extractor,
  Extractor.of({
    extract: Effect.fn("Pdf.extract")((bytes) =>
      Effect.scoped(
        Effect.gen(function* () {
          const task = yield* Effect.acquireRelease(
            Effect.sync(() => getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })),
            (task) => Effect.promise(() => task.destroy()),
          );

          const pdf = yield* Effect.tryPromise({
            try: () => task.promise,
            catch: () =>
              new InvalidInput({
                message: "Unable to read this PDF. Check that it is not encrypted or damaged.",
              }),
          });

          if (pdf.numPages > 2000)
            return yield* new InvalidInput({ message: "PDF limit is 2,000 pages." });

          const pages: BookPage[] = [];

          let total = 0;

          for (let page = 1; page <= pdf.numPages; page++) {
            const pdfPage = yield* Effect.tryPromise({
              try: () => pdf.getPage(page),
              catch: () => new InvalidInput({ message: "Unable to read PDF page." }),
            });

            const content = yield* Effect.tryPromise({
              try: () => pdfPage.getTextContent(),
              catch: () => new InvalidInput({ message: "Unable to extract PDF text." }),
            });

            const text = content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ")
              .trim();

            total += text.length;

            if (text.length > 24000 || total > 5_000_000)
              return yield* new InvalidInput({ message: "PDF exceeds the supported text budget." });

            pages.push({ page, text });
          }

          if (total < 20)
            return yield* new InvalidInput({
              message: "No readable text found. Scanned PDFs require OCR.",
            });

          return { pages, pageCount: pdf.numPages };
        }),
      ),
    ),
  }),
);
