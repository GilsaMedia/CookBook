#!/usr/bin/env node
/**
 * The cookbook's AI server. Runs on the owner's machine and calls headless
 * Claude Code with the owner's subscription token (CLAUDE_CODE_OAUTH_TOKEN).
 *
 * Only the Supabase `ai` Edge Function talks to it: every request needs the
 * shared AI_SERVER_SECRET, and the Edge Function has already checked the
 * user's session, membership, that the book is turned on and the daily
 * limits. The server adds its own limits: known tasks only, size caps, two
 * jobs at a time, a timeout. It never logs inputs, results or tokens.
 *
 *   POST /v1/run   { "task": "structure_recipe", "input": "…" }   → { "result": {…} }
 *   GET  /health   → { "ok": true }
 */
import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS } from "./tasks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 1024 * 1024; // a piece of a long document fits
const MAX_JOBS = 2;
const TIMEOUT_MS = 130_000;
// A video job does download + speech-to-text + frames first, then Claude;
// both must fit inside the Edge Function's ~150 s limit.
const VIDEO_PREP_MS = 75_000;
const VIDEO_CLAUDE_MS = 60_000;

/** Constant-time check of "Authorization: Bearer <secret>". */
export function authorized(header, secret) {
  if (!secret || secret.length < 32 || typeof header !== "string") return false;
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

/** Validates a request body; returns { task, input } or an error code. */
export function parseJob(body) {
  if (!body || typeof body !== "object") return { error: "bad_request" };
  const task = TASKS[body.task];
  if (!Object.hasOwn(TASKS, body.task) || !task) return { error: "unknown_task" };
  if (typeof body.input !== "string" || !body.input.trim()) return { error: "bad_request" };
  if (body.input.length > task.maxChars) return { error: "too_long" };
  return { task, input: body.input };
}

/** Only what Claude Code needs; never an API key, so it uses the subscription. */
function claudeEnv() {
  const env = { DISABLE_AUTOUPDATER: "1" };
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "CLAUDE_CODE_OAUTH_TOKEN",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.PATH = `${env.PATH ?? "/usr/bin:/bin"}:${process.env.HOME}/.local/bin`;
  return env;
}

/** Maps a Claude Code failure to a short code the app can explain. */
function failure(text) {
  const t = String(text).toLowerCase();
  if (t.includes("limit")) return "usage_limit";
  if (t.includes("auth") || t.includes("login") || t.includes("token")) return "ai_signin";
  return "ai_failed";
}

/** Runs video.py: downloads the video and writes contact sheets into `folder`. */
function prepareVideo(url, folder) {
  const python = path.join(HERE, ".venv/bin/python");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(HERE, "video.py"), url, folder], {
      cwd: folder,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "",
        LANG: "C.UTF-8",
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), VIDEO_PREP_MS);
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => reject(new Error("ai_unavailable")));
    child.on("close", () => {
      clearTimeout(timer);
      let data;
      try {
        data = JSON.parse(out.trim().split("\n").pop());
      } catch {
        return reject(new Error("fetch_failed"));
      }
      if (data.error) return reject(new Error(data.error));
      resolve(data);
    });
  });
}

/**
 * Runs one job in a private folder that's deleted afterwards. A video is
 * prepared first (transcript + contact sheets); then one headless Claude
 * Code session runs with only the task's tools: none; WebSearch, which
 * runs on Anthropic's side (nothing on this machine fetches a page); or
 * Read, which --restricted confines to that folder.
 */
async function runTask(task, input) {
  const folder = mkdtempSync(path.join(tmpdir(), "cookbook-ai-"));
  try {
    if (!task.video) {
      return { result: await runClaude(task, task.prompt(input), folder, TIMEOUT_MS) };
    }
    const video = await prepareVideo(input, folder);
    const result = await runClaude(task, task.prompt(input, video), folder, VIDEO_CLAUDE_MS);
    return { result, video: { author: video.author ?? null, thumbnail: video.thumbnail ?? null } };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** One headless Claude Code session; resolves with the schema-checked answer. */
function runClaude(task, prompt, folder, timeoutMs) {
  const bin = process.env.CLAUDE_BIN || path.join(process.env.HOME ?? "", ".local/bin/claude");
  const tools = task.tools ?? [];
  const args = [
    "-p",
    "--model",
    task.model(),
    "--tools",
    tools.join(","),
    ...(tools.length ? ["--allowedTools", ...tools] : []),
    "--restricted",
    "--strict-mcp-config",
    "--safe-mode",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(task.schema),
    "--system-prompt",
    task.system,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: folder,
      env: claudeEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", () => reject(new Error("ai_unavailable")));
    child.on("close", () => {
      clearTimeout(timer);
      let result;
      try {
        result = JSON.parse(out);
      } catch {
        return reject(new Error(err ? failure(err) : "ai_failed"));
      }
      if (result.is_error || result.subtype !== "success")
        return reject(new Error(failure(result.result)));
      if (result.structured_output) return resolve(result.structured_output);
      try {
        resolve(JSON.parse(result.result));
      } catch {
        reject(new Error("ai_failed"));
      }
    });
    child.stdin.end(prompt);
  });
}

let jobs = 0;

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export function createAiServer({ secret = process.env.AI_SERVER_SECRET, run = runTask } = {}) {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/v1/run")
      return send(res, 404, { error: "not_found" });
    if (!authorized(req.headers.authorization, secret))
      return send(res, 401, { error: "unauthorized" });

    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) req.destroy();
      else chunks.push(chunk);
    });
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(res, 400, { error: "bad_request" });
      }
      const job = parseJob(body);
      if (job.error) return send(res, job.error === "too_long" ? 413 : 400, { error: job.error });
      if (jobs >= MAX_JOBS) return send(res, 429, { error: "busy" });

      jobs++;
      const started = Date.now();
      try {
        const out = await run(job.task, job.input);
        console.log(`${body.task} ok in ${Date.now() - started}ms`);
        send(res, 200, out);
      } catch (e) {
        console.log(`${body.task} failed (${e.message}) in ${Date.now() - started}ms`);
        send(res, 502, { error: e.message || "ai_failed" });
      } finally {
        jobs--;
      }
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.env.AI_SERVER_SECRET || process.env.AI_SERVER_SECRET.length < 32) {
    console.error("AI_SERVER_SECRET must be set (32+ characters).");
    process.exit(1);
  }
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) console.warn("CLAUDE_CODE_OAUTH_TOKEN is not set.");
  const port = Number(process.env.PORT ?? 8810);
  // Loopback only: Tailscale Funnel is the one way in.
  createAiServer().listen(port, "127.0.0.1", () =>
    console.log(`cookbook AI server on 127.0.0.1:${port}`),
  );
}
