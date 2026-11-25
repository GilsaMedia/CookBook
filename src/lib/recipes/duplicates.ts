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

export const TITLE_SIMILARITY = 0.6;
export const INGREDIENT_OVERLAP = 0.7;

/**
 * Recipes in the book that look like the one being imported (PRD §13.3):
 * the same source link, a title with trigram similarity above 0.6, or more
 * than 70% of the ingredients in common (by canonical name, at least 3).
 */
export function findDuplicates(
  draft: { title: string; ingredientNames: string[]; sourceUrl: string | null },
  library: RecipeCard[],
): RecipeCard[] {
  const names = new Set(draft.ingredientNames.map((n) => normalizeHebrew(n)).filter(Boolean));
  const sameUrl = (u: string | null) =>
    !!u && !!draft.sourceUrl && u.replace(/\/$/, "") === draft.sourceUrl.replace(/\/$/, "");
  return library.filter((r) => {
    if (sameUrl(r.sourceUrl)) return true;
    if (textSimilarity(draft.title, r.title) > TITLE_SIMILARITY) return true;
    const theirs = new Set(r.ingredientNames);
    const shared = [...names].filter((n) => theirs.has(n)).length;
    const smaller = Math.min(names.size, theirs.size);
    return shared >= 3 && smaller > 0 && shared / smaller > INGREDIENT_OVERLAP;
  });
}
