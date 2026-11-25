// Recipes and photos from the web, for a recipe the family knows by name.
//
// Claude searches the web on the AI server (find_recipe_page: WebSearch
// runs on Anthropic's side) and answers with page addresses only. The
// pages are fetched here, public addresses only, like any imported link.
import { callAiServer, importLink, type Outcome } from "./ai-import.ts";
import { extractRecipePage } from "./recipe-page.ts";
import { decodeHtml, safeFetch } from "./safe-fetch.ts";
import { videoSite } from "./video-sites.ts";

/** A photo and the page it's from, for the credit under it. */
export type Photo = { image: string; page: string; site: string };

type Page = { url: string; match: "exact" | "similar" };

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** What Claude is told: the name, and a hint (author, source, ingredients). */
export const lookupInput = (title: string, hint?: string | null) =>
  [title.trim(), hint?.trim() ? `Hint: ${hint.trim()}` : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1000);

/** Up to 3 recipe pages for a recipe known by name; an error code on failure. */
export async function findRecipePages(
  title: string,
  hint?: string | null,
): Promise<{ pages: Page[] } | { error: string }> {
  const reply = await callAiServer("find_recipe_page", lookupInput(title, hint));
  if (reply.error) return { error: reply.error };
  const pages = ((reply.result as { pages?: Page[] } | undefined)?.pages ?? []).filter((p) =>
    /^https:\/\//.test(p.url),
  );
  return { pages };
}

/** A web page's main photo (the recipe's own, else the page's preview image). */
export async function pagePhoto(url: string): Promise<Photo | null> {
  try {
    const page = await safeFetch(url, {
      maxBytes: 2 * 1024 * 1024,
      accept: /text\/html|application\/xhtml\+xml/,
    });
    const extract = extractRecipePage(decodeHtml(page), page.url);
    if (!extract.image || !/^https:\/\//.test(extract.image)) return null;
    return { image: extract.image, page: url, site: extract.siteName || host(url) };
  } catch {
    return null;
  }
}

/**
 * A photo for a recipe: from its own source page when it has one, else
 * from a page Claude finds for it on the web. Null when there's none (or
 * the AI server is busy: then `busy` is set so the caller can try later).
 */
export async function findPhoto(recipe: {
  title: string;
  hint?: string | null;
  sourceUrl?: string | null;
}): Promise<{ photo: Photo | null; busy?: boolean }> {
  if (recipe.sourceUrl && !videoSite(recipe.sourceUrl)) {
    const own = await pagePhoto(recipe.sourceUrl);
    if (own) return { photo: own };
  }
  const found = await findRecipePages(recipe.title, recipe.hint);
  if ("error" in found) return { photo: null, busy: found.error === "busy" };
  for (const page of found.pages) {
    const photo = await pagePhoto(page.url);
    if (photo) return { photo };
  }
  return { photo: null };
}

/**
 * A recipe the document has only a name for: Claude finds its page on the
 * web, and the page is imported like any link (its own photo included).
 */
export async function findRecipeOnline(title: string, hint?: string | null): Promise<Outcome> {
  const found = await findRecipePages(title, hint);
  if ("error" in found) return { ok: false, error: found.error };
  for (const page of found.pages.slice(0, 2)) {
    const out = await importLink(page.url);
    if (out.ok || out.error === "busy" || out.error === "ai_unavailable") return out;
  }
  return { ok: false, error: "not_found_online" };
}
