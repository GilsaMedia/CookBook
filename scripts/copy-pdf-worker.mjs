#!/usr/bin/env node
// PDF.js reads PDFs in a web worker; the app serves its worker file from
// public/ (static site, no bundler magic). Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const from = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "build/pdf.worker.min.mjs",
);
mkdirSync("public", { recursive: true });
copyFileSync(from, "public/pdf.worker.min.mjs");
