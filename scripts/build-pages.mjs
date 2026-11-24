#!/usr/bin/env node
/**
 * Builds the static demo for GitHub Pages into ./out.
 *
 * The demo shows the sample book (src/lib/data/sample-recipes.json) with no
 * Supabase and no sign-in. Static export can't include the proxy, the auth
 * route handlers, the login server action or the service-worker route, so
 * the build runs on a temporary copy (.pages-build/) without them. The real
 * app is untouched.
 *
 *   PAGES_BASE_PATH=/cookbook-demo npm run build:pages
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".pages-build");
const out = path.join(root, "out");
const basePath = process.env.PAGES_BASE_PATH ?? "/cookbook-demo";

const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
  "out",
  ".pages-build",
  "test-results",
  "playwright-report",
]);
const SERVER_ONLY = ["src/proxy.ts", "src/app/auth", "src/app/login", "src/app/serwist"];

rmSync(work, { recursive: true, force: true });
for (const entry of readdirSync(root)) {
  if (SKIP.has(entry) || entry.startsWith(".env")) continue;
  cpSync(path.join(root, entry), path.join(work, entry), { recursive: true });
}
symlinkSync(path.join(root, "node_modules"), path.join(work, "node_modules"), "dir");
for (const p of SERVER_ONLY) rmSync(path.join(work, p), { recursive: true, force: true });

execFileSync(path.join(root, "node_modules/.bin/next"), ["build"], {
  cwd: work,
  stdio: "inherit",
  env: {
    ...process.env,
    PAGES_EXPORT: "1",
    NEXT_PUBLIC_DEMO: "1",
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

rmSync(out, { recursive: true, force: true });
cpSync(path.join(work, "out"), out, { recursive: true });
// Without this, GitHub Pages runs Jekyll, which drops the _next/ folder.
writeFileSync(path.join(out, ".nojekyll"), "");
rmSync(work, { recursive: true, force: true });
console.log(
  `\nStatic demo in ${path.relative(process.cwd(), out) || "."}/ (base path ${basePath}).`,
);
if (!existsSync(path.join(out, "index.html"))) process.exit(1);
