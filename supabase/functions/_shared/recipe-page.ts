// Turns a fetched web page into compact text for the AI, plus the source's
// name and image. Pure functions (no Deno or Node APIs) so they run in the
// Edge Function and in Vitest.
//
// Most recipe sites embed schema.org Recipe JSON-LD; when it's there, the
// AI gets exactly the recipe and nothing else from the page. Otherwise it
// gets the page's readable text, capped.

export const MAX_TEXT = 20_000;

export type PageExtract = {
  /** Text to send to the AI; empty when the page has nothing usable. */
  text: string;
  /** True when the text came from schema.org Recipe data. */
  fromJsonLd: boolean;
  /** True when the text is a social video's caption (e.g. TikTok). */
  fromCaption: boolean;
  siteName: string | null;
  image: string | null;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Node = { [key: string]: Json };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  deg: "°",
  times: "×",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};
// Accented Latin letters, e.g. &eacute; &Uuml; &ccedil;.
const ACCENTS: Record<string, string> = {
  acute: "\u0301",
  grave: "\u0300",
  circ: "\u0302",
  uml: "\u0308",
  tilde: "\u0303",
  cedil: "\u0327",
  ring: "\u030A",
};
const accented = (name: string) => {
  const m = name.match(/^([a-z])(acute|grave|circ|uml|tilde|cedil|ring)$/i);
  return m ? (m[1] + ACCENTS[m[2].toLowerCase()]).normalize("NFC") : undefined;
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? accented(code) ?? m;
  });
}

const clean = (s: string) =>
  decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== name) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    const value = content?.[1] ?? content?.[2];
    if (value?.trim()) return decodeEntities(value.trim());
  }
  return null;
}

function absolute(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Every JSON-LD node on the page, flattening arrays and @graph. */
function jsonLdNodes(html: string): Node[] {
  const nodes: Node[] = [];
  const visit = (v: Json) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      nodes.push(v);
      if (v["@graph"]) visit(v["@graph"]);
    }
  };
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of scripts) {
    try {
      visit(JSON.parse(body.trim()));
    } catch {
      // Broken JSON-LD is common; skip it.
    }
  }
  return nodes;
}

const isRecipe = (n: Node) => {
  const t = n["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
};

const str = (v: Json | undefined): string | null =>
  typeof v === "string" ? clean(v) || null : typeof v === "number" ? String(v) : null;

/** "PT1H15M" → 75. Null when absent or unparseable. */
export function isoMinutes(v: Json | undefined): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i);
  if (!m) return null;
  const minutes = (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

function imageOf(v: Json | undefined): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return imageOf(v[0]);
  if (v && typeof v === "object") return str(v.url) ?? str(v["@id"]);
  return null;
}

/** Flattens HowToStep / HowToSection / plain strings into lines. */
function instructions(v: Json | undefined): string[] {
  if (typeof v === "string") {
    return v
      .split(/\n+|(?<=\.)\s+(?=\d+\.)/)
      .map(clean)
      .filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(instructions);
  if (v && typeof v === "object") {
    if (v.itemListElement) {
      const name = str(v.name);
      const steps = instructions(v.itemListElement);
      return name ? [`${name}:`, ...steps] : steps;
    }
    const text = str(v.text) ?? str(v.name);
    return text ? [text] : [];
  }
  return [];
}

function recipeText(r: Node): string {
  const lines: string[] = [];
  const title = str(r.name);
  if (title) lines.push(`Title: ${title}`);
  const yieldValue = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  const servings = str(yieldValue);
  if (servings) lines.push(`Yield: ${servings}`);
  for (const [label, key] of [
    ["Prep time", "prepTime"],
    ["Cook time", "cookTime"],
    ["Total time", "totalTime"],
  ] as const) {
    const minutes = isoMinutes(r[key]);
    if (minutes) lines.push(`${label}: ${minutes} minutes`);
  }
  const cuisine = str(Array.isArray(r.recipeCuisine) ? r.recipeCuisine[0] : r.recipeCuisine);
  if (cuisine) lines.push(`Cuisine: ${cuisine}`);
  const ingredients = Array.isArray(r.recipeIngredient) ? r.recipeIngredient : [];
  lines.push("Ingredients:");
  for (const i of ingredients) {
    const line = str(i);
    if (line) lines.push(`- ${line}`);
  }
  lines.push("Steps:");
  instructions(r.recipeInstructions).forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  return lines.join("\n");
}

/**
 * A TikTok video's caption, creator and cover. TikTok pages are rendered by
 * JavaScript; the caption (where creators write the recipe) is in the
 * embedded __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON.
 */
function tiktokVideo(
  html: string,
): { caption: string; author: string | null; cover: string | null } | null {
  const raw = html.match(
    /<script\b[^>]*id\s*=\s*["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!raw) return null;
  let data: Json;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const get = (v: Json | undefined, ...keys: string[]): Json | undefined =>
    keys.reduce<Json | undefined>(
      (acc, k) => (acc && typeof acc === "object" && !Array.isArray(acc) ? acc[k] : undefined),
      v,
    );
  const item = get(data, "__DEFAULT_SCOPE__", "webapp.video-detail", "itemInfo", "itemStruct");
  const caption = typeof get(item, "desc") === "string" ? (get(item, "desc") as string).trim() : "";
  if (!caption) return null;
  return {
    caption,
    author: str(get(item, "author", "nickname")) ?? str(get(item, "author", "uniqueId")),
    cover: str(get(item, "video", "cover")) ?? str(get(item, "video", "originCover")),
  };
}

/** The page's readable text: main content if marked up, else the body. */
function readableText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|template|iframe|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi,
      " ",
    );
  const main =
    stripped.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ??
    stripped.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ??
    stripped.match(/<body\b[\s\S]*<\/body>/i)?.[0] ??
    stripped;
  // Keep line structure so lists and steps stay readable.
  const withBreaks = main.replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr)\b[^>]*>/gi, "\n");
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  // Short pages often keep the gist in their description (social posts, videos).
  const description = meta(html, "og:description") ?? meta(html, "description");
  const body = decodeEntities(withBreaks.replace(/<[^>]*>/g, " "))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return [title && `Title: ${title}`, description && `Description: ${description}`, body]
    .filter(Boolean)
    .join("\n");
}

export function extractRecipePage(html: string, pageUrl: string): PageExtract {
  let siteName = meta(html, "og:site_name");
  if (!siteName) {
    try {
      siteName = new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      siteName = null;
    }
  }
  const recipe = jsonLdNodes(html).find(isRecipe);
  if (recipe) {
    return {
      text: recipeText(recipe).slice(0, MAX_TEXT),
      fromJsonLd: true,
      fromCaption: false,
      siteName,
      image: absolute(imageOf(recipe.image) ?? meta(html, "og:image"), pageUrl),
    };
  }
  const video = tiktokVideo(html);
  if (video) {
    return {
      text: `Video caption:\n${video.caption}`.slice(0, MAX_TEXT),
      fromJsonLd: false,
      fromCaption: true,
      siteName: video.author ? `${video.author} · TikTok` : "TikTok",
      image: absolute(video.cover, pageUrl),
    };
  }
  return {
    text: readableText(html).slice(0, MAX_TEXT),
    fromJsonLd: false,
    fromCaption: false,
    siteName,
    image: absolute(meta(html, "og:image"), pageUrl),
  };
}

/**
 * Pages without recipe data and with almost no text (a login wall, an empty
 * shell rendered by JavaScript) aren't worth an AI call.
 */
export const tooLittleText = (e: PageExtract) =>
  !e.fromJsonLd && !e.fromCaption && e.text.length < 200;
