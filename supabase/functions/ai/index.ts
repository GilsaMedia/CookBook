// The `ai` Edge Function: the only way into the AI server.
//
// The AI runs on the owner's Claude subscription (ai-server/ on the owner's
// machine), so before anything reaches it this function checks, in order:
// an allowed origin, a valid Supabase session, a known task with a size
// limit, and `public.ai_take_quota` (owner or contributor of the book, the
// book turned on by the server owner, daily limits). Only then does it call
// the AI server with the shared secret. Nothing is logged except error codes.
//
// Secrets (`npx supabase secrets set`): AI_SERVER_URL, AI_SERVER_SECRET.
// Optional: AI_ALLOWED_ORIGINS (comma-separated).
import { createClient } from "npm:@supabase/supabase-js@2";
import { importLink, importText } from "../_shared/ai-import.ts";
import { checkUrl } from "../_shared/safe-fetch.ts";

// Link problems are the user's to fix (422), not the AI's.
const FETCH_ERRORS: Record<string, true> = {
  bad_url: true,
  blocked_url: true,
  fetch_failed: true,
  wrong_type: true,
  too_large: true,
  video_too_long: true,
};

const ORIGINS = (
  Deno.env.get("AI_ALLOWED_ORIGINS") ??
  "https://gilsamedia.github.io,http://localhost:3000,http://localhost:3100"
)
  .split(",")
  .map((o) => o.trim());

// What the app may ask for. Both end in the AI server's structure_recipe.
const TASKS: Record<string, { maxChars: number }> = {
  structure_recipe: { maxChars: 20_000 }, // pasted text
  import_url: { maxChars: 2_048 }, // a recipe page's address
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method" });
  if (origin && !ORIGINS.includes(origin)) return reply(403, { error: "origin" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!Deno.env.get("AI_SERVER_URL")) return reply(503, { error: "ai_unavailable" });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  const user = auth.user;
  if (!user) return reply(401, { error: "signed_out" });

  let body: { task?: string; bookId?: string; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "bad_request" });
  }
  const task = body.task && Object.hasOwn(TASKS, body.task) ? TASKS[body.task] : null;
  if (
    !task ||
    typeof body.input !== "string" ||
    !body.input.trim() ||
    !UUID.test(body.bookId ?? "")
  ) {
    return reply(400, { error: "bad_request" });
  }
  if (body.input.length > task.maxChars) return reply(413, { error: "too_long" });
  // A bad link shouldn't use up one of the day's AI calls.
  if (body.task === "import_url") {
    const problem = checkUrl(body.input.trim());
    if (problem) return reply(422, { error: problem });
  }

  // Membership, the book being turned on and the daily limits, in one step.
  const { data: verdict, error } = await admin.rpc("ai_take_quota", {
    p_book: body.bookId,
    p_user: user.id,
  });
  if (error) return reply(503, { error: "ai_unavailable" });
  if (verdict !== "ok") return reply(verdict === "not_member" ? 403 : 429, { error: verdict });

  const out =
    body.task === "import_url" ? await importLink(body.input.trim()) : await importText(body.input);
  if (out.ok) return reply(200, { result: out.result, source: out.source });
  const status =
    out.error === "ai_unavailable"
      ? 503
      : out.error === "not_recipe" || out.error in FETCH_ERRORS
        ? 422
        : 502;
  return reply(status, { error: out.error });
});
