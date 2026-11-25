import { normalizeHebrew, trigrams } from "@/lib/search/hebrew";
import type { RecipeCard } from "./types";

/** pg_trgm similarity between two whole strings (trigrams of every word). */
export function textSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Set<string>();
    for (const word of normalizeHebrew(s).split(" ").filter(Boolean)) {
      for (const g of trigrams(word)) out.add(g);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

/** At least this share of all ingredients in common (Jaccard), and at least this many. */
export const SAME_INGREDIENTS = 0.8;
export const MIN_SHARED_INGREDIENTS = 4;

/** A title for comparing: same letters and words, punctuation and spacing aside. */
export const titleKey = (title: string) => normalizeHebrew(title).replace(/\s+/g, " ");

/**
 * Recipes in the book that are the one being imported: the same source
 * link, the same name, or the same recipe under another name (nearly the
 * same ingredients: 80% of all of them in common, at least 4). A similar
 * name alone isn't enough: families keep versions like "מוסקה של קורין"
 * and "מוסקה – קורין", and both belong in the book.
 */
export function findDuplicates(
  draft: { title: string; ingredientNames: string[]; sourceUrl: string | null },
  library: RecipeCard[],
): RecipeCard[] {
  const names = new Set(draft.ingredientNames.map((n) => normalizeHebrew(n)).filter(Boolean));
  const key = titleKey(draft.title);
  const sameUrl = (u: string | null) =>
    !!u && !!draft.sourceUrl && u.replace(/\/$/, "") === draft.sourceUrl.replace(/\/$/, "");
  return library.filter((r) => {
    if (sameUrl(r.sourceUrl)) return true;
    if (key && titleKey(r.title) === key) return true;
    const theirs = new Set(r.ingredientNames);
    const shared = [...names].filter((n) => theirs.has(n)).length;
    const all = new Set([...names, ...theirs]).size;
    return shared >= MIN_SHARED_INGREDIENTS && shared / all >= SAME_INGREDIENTS;
  });
}
