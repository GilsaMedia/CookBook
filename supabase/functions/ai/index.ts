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
import { extractRecipePage, tooLittleText } from "../_shared/recipe-page.ts";
import { checkUrl, decodeHtml, FetchBlocked, safeFetch } from "../_shared/safe-fetch.ts";
import { videoSite } from "../_shared/video-sites.ts";

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
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

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
  const aiUrl = Deno.env.get("AI_SERVER_URL");
  const aiSecret = Deno.env.get("AI_SERVER_SECRET");
  if (!aiUrl || !aiSecret) return reply(503, { error: "ai_unavailable" });

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

  const callAi = async (task: string, input: string) => {
    try {
      const res = await fetch(`${aiUrl.replace(/\/$/, "")}/v1/run`, {
        method: "POST",
        headers: { authorization: `Bearer ${aiSecret}`, "content-type": "application/json" },
        body: JSON.stringify({ task, input }),
        signal: AbortSignal.timeout(145_000),
      });
      const out = await res.json().catch(() => ({ error: "ai_failed" }));
      return res.ok ? out : { error: out.error ?? "ai_failed" };
    } catch {
      return { error: "ai_unavailable" };
    }
  };
  const finish = (out: { error?: string; result?: { is_recipe?: boolean } }, source: unknown) => {
    if (out.error) return reply(out.error === "ai_unavailable" ? 503 : 502, { error: out.error });
    if (!out.result?.is_recipe) return reply(422, { error: "not_recipe" });
    return reply(200, { result: out.result, source });
  };

  if (body.task === "structure_recipe")
    return finish(await callAi("structure_recipe", body.input), null);

  const link = body.input.trim();

  // A video (TikTok, YouTube, Instagram): the AI server watches it, reading
  // the caption, what's said and what's shown. If the video can't be
  // downloaded, fall back to the page's caption below.
  const site = videoSite(link);
  if (site) {
    const out = await callAi("structure_video", link);
    if (out.error !== "fetch_failed" && out.error !== "video_too_long") {
      const author = out.video?.author;
      return finish(out, {
        url: link,
        name: author ? `${author} · ${site}` : site,
        image: out.video?.thumbnail ?? null,
      });
    }
  }

  // A web page: fetch it here (public addresses only), keep just the recipe.
  let text: string;
  let source: { url: string; name: string | null; image: string | null };
  try {
    const page = await safeFetch(link, {
      maxBytes: MAX_PAGE_BYTES,
      accept: /text\/html|application\/xhtml\+xml/,
    });
    const extract = extractRecipePage(decodeHtml(page), page.url);
    if (tooLittleText(extract)) return reply(422, { error: "not_recipe" });
    text = extract.text;
    source = { url: link, name: extract.siteName, image: extract.image };
  } catch (e) {
    return reply(422, { error: e instanceof FetchBlocked ? e.message : "fetch_failed" });
  }
  return finish(await callAi("structure_recipe", text), source);
});
