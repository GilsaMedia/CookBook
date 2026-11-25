import type { Paragraph } from "./docx";
import type { ImportEntry } from "./types";

// Navigation lines Efrat's Doc adds under every recipe (PRD §7.3).
const NAVIGATION = /לתוכן העניינים|הוספה לארוחה|back to (the )?(top|contents)/i;
const SOURCE_LABEL = /^\s*(מקור( המתכון)?|source|recipe source)\s*[:：]?\s*/i;
const URL_ONLY = /^\s*https?:\/\/\S+\s*$/i;

const hostName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * Splits a document into recipes, deterministically: the top heading level
 * in use is the category, the next one is the recipe (a document with one
 * level has recipes only). Everything under a recipe heading is its body.
 * The AI only structures each body later.
 */
export function splitDocument(paragraphs: Paragraph[]): ImportEntry[] {
  const levels = [
    ...new Set(
      paragraphs.filter((p) => p.level && !p.title && !p.toc && p.text).map((p) => p.level!),
    ),
  ].sort((a, b) => a - b);
  const categoryLevel = levels.length >= 2 ? levels[0] : null;
  const recipeLevel = levels.length >= 2 ? levels[1] : (levels[0] ?? null);
  if (recipeLevel === null) return [];

  const entries: ImportEntry[] = [];
  let category: string | null = null;
  let current: { title: string; lines: string[]; links: string[]; source: string | null } | null =
    null;

  const flush = () => {
    if (!current) return;
    const lines = current.lines.filter((l) => l.trim());
    const onlyLink = lines.length === 0 && (current.source ?? current.links[0]);
    const titleLink = URL_ONLY.test(current.title) ? current.title.trim() : null;
    const sourceUrl =
      current.source ?? titleLink ?? (lines.length === 0 ? (current.links[0] ?? null) : null);
    const kind: ImportEntry["kind"] =
      lines.length > 0 ? "recipe" : onlyLink || titleLink ? "link" : "empty";
    entries.push({
      key: `doc-${entries.length + 1}`,
      title: current.title,
      group: category,
      kind,
      text: kind === "recipe" ? [`Title: ${current.title}`, ...lines].join("\n") : "",
      sourceUrl,
      sourceName: sourceUrl ? hostName(sourceUrl) : null,
    });
    current = null;
  };

  for (const p of paragraphs) {
    if (p.toc || p.title) continue;
    if (p.level !== null && p.level <= recipeLevel && p.text) {
      flush();
      if (p.level === categoryLevel || (categoryLevel !== null && p.level < recipeLevel)) {
        category = p.text;
      } else {
        current = { title: p.text, lines: [], links: [], source: null };
      }
      continue;
    }
    if (!current) continue; // text before the first recipe: intro, table of contents
    if (NAVIGATION.test(p.text)) continue;
    const links = p.links.map((l) => l.url);
    if (SOURCE_LABEL.test(p.text) && (links.length || /https?:\/\//.test(p.text))) {
      current.source = links[0] ?? p.text.match(/https?:\/\/\S+/)?.[0] ?? null;
      continue;
    }
    current.links.push(...links);
    if (p.text) current.lines.push(p.list ? `- ${p.text}` : p.text);
  }
  flush();
  return entries;
}
