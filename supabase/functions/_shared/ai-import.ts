// Turning a recipe link or text into a structured recipe through the AI
// server. Shared by the `ai` Edge Function (one recipe, for a signed-in
// user who passed the access checks) and `import-worker` (bulk imports
// the owner already queued). Access checks are the callers' job.
import { extractRecipePage, tooLittleText } from "./recipe-page.ts";
import { decodeHtml, FetchBlocked, safeFetch } from "./safe-fetch.ts";
import { videoSite } from "./video-sites.ts";

const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export type Source = { url: string; name: string | null; image: string | null };
export type Outcome =
  | { ok: true; result: Record<string, unknown>; source: Source | null }
  | { ok: false; error: string };

type AiReply = {
  error?: string;
  result?: Record<string, unknown> & { is_recipe?: boolean };
  video?: { author?: string | null; thumbnail?: string | null };
};

/** Calls the owner's AI server with the shared secret. */
export async function callAiServer(task: string, input: string): Promise<AiReply> {
  const url = Deno.env.get("AI_SERVER_URL");
  const secret = Deno.env.get("AI_SERVER_SECRET");
  if (!url || !secret) return { error: "ai_unavailable" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ task, input }),
      signal: AbortSignal.timeout(145_000),
    });
    const out = await res.json().catch(() => ({ error: "ai_failed" }));
    return res.ok ? out : { error: out.error ?? "ai_failed" };
  } catch {
    return { error: "ai_unavailable" };
  }
}

function outcome(reply: AiReply, source: Source | null): Outcome {
  if (reply.error) return { ok: false, error: reply.error };
  if (!reply.result?.is_recipe) return { ok: false, error: "not_recipe" };
  return { ok: true, result: reply.result, source };
}

/** Pasted or extracted recipe text → structured recipe. */
export async function importText(text: string): Promise<Outcome> {
  return outcome(await callAiServer("structure_recipe", text), null);
}

/**
 * A link → structured recipe. Videos (TikTok, YouTube, Instagram) are
 * watched by the AI server; if one can't be downloaded, its page's caption
 * is used. Web pages are fetched here, public addresses only.
 */
export async function importLink(link: string): Promise<Outcome> {
  const site = videoSite(link);
  if (site) {
    const reply = await callAiServer("structure_video", link);
    if (reply.error !== "fetch_failed" && reply.error !== "video_too_long") {
      const author = reply.video?.author;
      return outcome(reply, {
        url: link,
        name: author ? `${author} · ${site}` : site,
        image: reply.video?.thumbnail ?? null,
      });
    }
  }
  let text: string;
  let source: Source;
  try {
    const page = await safeFetch(link, {
      maxBytes: MAX_PAGE_BYTES,
      accept: /text\/html|application\/xhtml\+xml/,
    });
    const extract = extractRecipePage(decodeHtml(page), page.url);
    if (tooLittleText(extract)) return { ok: false, error: "not_recipe" };
    text = extract.text;
    source = { url: link, name: extract.siteName, image: extract.image };
  } catch (e) {
    return { ok: false, error: e instanceof FetchBlocked ? e.message : "fetch_failed" };
  }
  return outcome(await callAiServer("structure_recipe", text), source);
}
