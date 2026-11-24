/**
 * Hebrew-aware recipe search that runs in the browser.
 *
 * A book is small (a few hundred recipes), so the library loads every
 * recipe's `search_text` once and filters locally: results update on every
 * keystroke with no network round trip. The matching mirrors the database:
 * `normalizeHebrew` is a port of `public.normalize_hebrew` (migration
 * 20261114170100_search.sql) and similarity is pg_trgm's trigram formula,
 * so "גזרים" finds "גזר" here exactly as it would in SQL.
 */

// Cantillation and niqqud. Keeps maqaf (U+05BE), which separates words.
const MARKS = /[֑-ׇֽֿׁׂׅׄ]/g;
const FINALS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
// Geresh, gershayim and quotes are deleted so צ'יפס stays one word.
const DELETED = /[׳״'"`]/g;

/** Same output as the SQL `public.normalize_hebrew`. Apply to queries and text alike. */
export function normalizeHebrew(input: string | null | undefined): string {
  return (input ?? "")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(DELETED, "")
    .replace(/[^0-9a-zא-ת]+/g, " ")
    .trim();
}

/** pg_trgm trigrams of one word: padded with two spaces before and one after. */
export function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** pg_trgm similarity between two single words: shared trigrams / all trigrams. */
export function wordSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** pg_trgm's default `similarity_threshold`. */
export const SIMILARITY_THRESHOLD = 0.3;

/**
 * How well one query word matches a text: 1 for a prefix match, otherwise
 * the best trigram similarity against any word, or 0 below the threshold.
 */
function wordScore(queryWord: string, textWords: string[]): number {
  let best = 0;
  for (const word of textWords) {
    if (word.startsWith(queryWord)) return 1;
    // One letter is too little to fuzz on; only prefixes count.
    if (queryWord.length < 2) continue;
    if (word.includes(queryWord)) best = Math.max(best, 0.9);
    else best = Math.max(best, wordSimilarity(queryWord, word));
  }
  return best >= SIMILARITY_THRESHOLD ? best : 0;
}

/**
 * Scores `searchText` (already normalized) against a raw query. Every query
 * word must match something; returns 0 when one doesn't.
 */
export function scoreMatch(query: string, searchText: string): number {
  const queryWords = normalizeHebrew(query).split(" ").filter(Boolean);
  if (queryWords.length === 0) return 1;
  const textWords = searchText.split(" ").filter(Boolean);
  let total = 0;
  for (const qw of queryWords) {
    const score = wordScore(qw, textWords);
    if (score === 0) return 0;
    total += score;
  }
  return total / queryWords.length;
}

/**
 * Filters and ranks items by a query. Best matches first; ties keep the
 * original order. An empty query returns the items unchanged.
 */
export function searchItems<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!normalizeHebrew(query)) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreMatch(query, text(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
