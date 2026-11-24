#!/usr/bin/env node
/**
 * Copies the service worker to the site root (out/sw.js).
 *
 * Serwist serves it at /serwist/sw.js with a `Service-Worker-Allowed: /`
 * header so it can control the whole app. A static host like GitHub Pages
 * can't send headers, and a worker's scope can't reach above its own folder,
 * so the copy at the root is the one the app registers.
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out");
for (const file of ["sw.js", "sw.js.map"]) {
  const from = path.join(out, "serwist", file);
  if (existsSync(from)) copyFileSync(from, path.join(out, file));
}
