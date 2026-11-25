#!/usr/bin/env node
/**
 * Serves the static build in ./out the way GitHub Pages does: /meals → meals.html,
 * folders → index.html, unknown paths → 404.html, under NEXT_PUBLIC_BASE_PATH.
 * Used by `npm run start` and the Playwright e2e tests.
 *
 *   node scripts/serve-static.mjs [port]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out");
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Maps a URL path to a file in ./out, like GitHub Pages; null if none. */
function resolve(urlPath) {
  const full = path.join(root, path.normalize(urlPath));
  if (!full.startsWith(root)) return null;
  for (const candidate of [full, `${full}.html`, path.join(full, "index.html")]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (base && urlPath !== base && !urlPath.startsWith(`${base}/`)) urlPath = "/__none__";
  else urlPath = urlPath.slice(base.length) || "/";

  const file = resolve(urlPath);
  const status = file ? 200 : 404;
  const send = file ?? path.join(root, "404.html");
  res.writeHead(status, {
    "content-type": TYPES[path.extname(send)] ?? "application/octet-stream",
  });
  createReadStream(send).pipe(res);
}).listen(port, () => console.log(`Serving ./out at http://localhost:${port}${base || "/"}`));
