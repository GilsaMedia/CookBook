import type { Paragraph } from "./docx";
import type { ImportEntry } from "./types";

/**
 * Any cookbook document → recipes, with Claude finding them. The document
 * becomes numbered lines; Claude answers only with each recipe's line range,
 * title, category and source link, so the recipe text itself is always the
 * document's own. Long documents are read in overlapping pieces.
 */

/** Lines of a Word document, keeping what helps Claude see the structure. */
export function docxLines(paragraphs: Paragraph[]): string[] {
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (p.toc) continue;
    const links = p.links.map((l) => l.url).filter((u) => !p.text.includes(u));
    const text = [p.text, ...links.map((u) => `(${u})`)].filter(Boolean).join(" ");
    if (!text.trim()) continue;
    const prefix = p.title
      ? "# "
      : p.level
        ? `${"#".repeat(Math.min(p.level + 1, 6))} `
        : p.list
          ? "- "
          : "";
    lines.push(prefix + text.trim());
  }
  return lines;
}

/** Lines of plain text or Markdown (Google Docs exports Markdown with headings). */
export const textLines = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim());

/** Lines of an HTML file: block elements become lines, links are kept. */
export function htmlLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript").forEach((e) => e.remove());
  doc.querySelectorAll("a[href^='http']").forEach((a) => a.append(` (${a.getAttribute("href")})`));
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const prefix = /^h\d$/.test(tag) ? `${"#".repeat(Number(tag[1]))} ` : tag === "li" ? "- " : "";
    el.prepend(`\n${prefix}`);
  });
  return textLines(doc.body.textContent ?? "");
}

export type Piece = { coreStart: number; coreEnd: number; prompt: string };

const PIECE_CHARS = 60_000;
const OVERLAP_LINES = 80;

/**
 * Splits numbered lines into pieces of about 60,000 characters. Each piece
 * also shows the next 80 lines, so a recipe that starts near its end isn't
 * cut off; Claude only reports recipes that start inside its core.
 */
export function pieces(lines: string[]): Piece[] {
  const out: Piece[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let size = 0;
    while (end < lines.length && (size < PIECE_CHARS || end === start))
      size += lines[end++].length + 8;
    const shown = Math.min(lines.length, end + OVERLAP_LINES);
    const numbered = lines.slice(start, shown).map((l, i) => `${start + i + 1}| ${l}`);
    out.push({
      coreStart: start + 1,
      coreEnd: end,
      prompt: `CORE: lines ${start + 1}–${end} (lines after ${end} are context only).\n\n${numbered.join("\n")}`,
    });
    start = end;
  }
  return out;
}

export type Found = {
  title: string;
  category: string | null;
  start: number;
  end: number;
  source_url: string | null;
};

// Navigation lines Efrat's Doc adds under every recipe (PRD §7.3).
const NAVIGATION = /לתוכן העניינים|הוספה לארוחה|back to (the )?(top|contents)/i;
const LINK = /https?:\/\/[^\s)]+/;
// No \b: it doesn't work after Hebrew letters.
const SOURCE_LINE = /^\s*-?\s*(מקור( המתכון)?|source)(?=[\s:(]|$)/i;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * Turns Claude's recipe list into import entries, using the document's own
 * lines: ranges are clamped, overlaps trimmed, duplicates (from overlapping
 * pieces) dropped, navigation lines removed.
 */
export function entriesFrom(lines: string[], found: Found[]): ImportEntry[] {
  const sorted = [...new Map(found.map((f) => [f.start, f])).values()]
    .filter((f) => f.start >= 1 && f.start <= lines.length)
    .sort((a, b) => a.start - b.start);
  return sorted.map((f, i) => {
    const nextStart = sorted[i + 1]?.start ?? lines.length + 1;
    const end = Math.max(f.start, Math.min(f.end, nextStart - 1, lines.length));
    const body = lines
      .slice(f.start, end) // the lines after the title line
      .map((l) => l.replace(/^#+\s*/, ""))
      .filter((l) => !NAVIGATION.test(l) && !(SOURCE_LINE.test(l) && LINK.test(l)));
    // A one-line recipe ("עוגה – 2 ביצים, כוס סוכר… אופים 30 דק׳") keeps its text on the title line.
    const titleLine = lines[f.start - 1].replace(/^#+\s*/, "");
    if (!body.length && titleLine.length > f.title.trim().length + 15) body.push(titleLine);
    const linkOnly =
      body.length > 0 &&
      body.every(
        (l) =>
          LINK.test(l) && l.replace(LINK, "").replace(/[()\s:]|מקור( המתכון)?|source/gi, "") === "",
      );
    const sourceUrl = f.source_url ?? (linkOnly ? (body.join(" ").match(LINK)?.[0] ?? null) : null);
    const kind: ImportEntry["kind"] =
      body.length && !linkOnly ? "recipe" : sourceUrl ? "link" : "empty";
    const title = f.title.trim() || lines[f.start - 1].replace(/^#+\s*/, "");
    return {
      key: `doc-${f.start}`,
      title,
      group: f.category?.trim() || null,
      kind,
      text: kind === "recipe" ? [`Title: ${title}`, ...body].join("\n") : "",
      sourceUrl,
      sourceName: sourceUrl ? host(sourceUrl) : null,
    };
  });
}
