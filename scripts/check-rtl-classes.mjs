#!/usr/bin/env node
/**
 * Fails when physical (left/right) Tailwind utilities appear in source files.
 * The app is RTL-first, so only logical utilities are allowed:
 *   ml-/mr- → ms-/me-   pl-/pr- → ps-/pe-   left-/right- → start-/end-
 *   text-left/right → text-start/end   rounded-l/r → rounded-s/e
 *   border-l/r → border-s/e   float-left/right → float-start/end
 *
 * Runs as part of `npm run lint` (and in CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOTS = ["src"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".mdx", ".html"]);

// A class token starts after whitespace, a quote, `{ ( , > !` or a variant colon (md:ml-2).
const BEFORE = String.raw`(?<=^|[\s"'\x60{(,>!:])`;
// ...and ends at whitespace, a quote, a closing brace/paren or end of line.
const AFTER = String.raw`(?=$|[\s"'\x60}),;])`;
const VALUE = String.raw`[^\s"'\x60}),;]+`;

const PHYSICAL = new RegExp(
  BEFORE +
    "(" +
    // Utilities that always take a value: ml-2, -mr-4, pl-[3px], scroll-pr-2, left-0, right-auto
    String.raw`-?(?:(?:scroll-)?[mp][lr]|left|right)-${VALUE}` +
    "|" +
    // Utilities that may be bare: border-l, rounded-tr-lg, text-right, float-left
    String.raw`(?:border-[lr]|rounded-[tb]?[lr]|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right))(?:-${VALUE})?` +
    ")" +
    AFTER,
  "gm",
);

/** Returns every physical class in `text` with its 1-based line and column. */
export function findPhysicalClasses(text) {
  const hits = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const match of line.matchAll(PHYSICAL)) {
      hits.push({ line: i + 1, column: match.index + 1, token: match[1] });
    }
  });
  return hits;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry))) yield full;
  }
}

/** Scans the source roots under `cwd`; returns violations with file paths. */
export function scan(cwd = process.cwd(), roots = ROOTS) {
  const violations = [];
  for (const root of roots) {
    const abs = path.join(cwd, root);
    try {
      statSync(abs);
    } catch {
      continue;
    }
    for (const file of walk(abs)) {
      for (const hit of findPhysicalClasses(readFileSync(file, "utf8"))) {
        violations.push({ file: path.relative(cwd, file), ...hit });
      }
    }
  }
  return violations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const violations = scan();
  if (violations.length === 0) {
    console.log("RTL class check: no physical left/right utilities found.");
  } else {
    for (const v of violations) {
      console.error(`${v.file}:${v.line}:${v.column}  physical class "${v.token}"`);
    }
    console.error(
      `\nRTL class check failed: ${violations.length} physical utilit${violations.length === 1 ? "y" : "ies"}.` +
        "\nUse logical utilities instead: ms-/me-, ps-/pe-, start-/end-, text-start/end, rounded-s/e, border-s/e, float-start/end.",
    );
    process.exit(1);
  }
}
