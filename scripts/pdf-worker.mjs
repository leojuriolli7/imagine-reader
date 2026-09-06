import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const pdfRequire = createRequire(require.resolve("react-pdf"));
mkdirSync(new URL("../apps/web/public", import.meta.url), { recursive: true });
copyFileSync(
  pdfRequire.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
  new URL("../apps/web/public/pdf.worker.min.mjs", import.meta.url),
);
