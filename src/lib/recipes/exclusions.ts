import { normalizeHebrew } from "@/lib/search/hebrew";
import type { Exclusion } from "./types";

type IngredientText = { canonicalName: string | null; displayText: string };

/**
 * Returns the excluded ingredients (PRD §10) that a recipe contains, in the
 * order the rules list them. A recipe is never hidden for this; the UI shows
 * a warning chip naming each one.
 *
 * Matching is by whole normalized words in the ingredient's canonical name
 * and its display text, so "הל" (cardamom) flags "1 כפית הל טחון" but not
 * "חלב".
 */
export function findExcluded(
  recipe: { id: string; categoryId: string | null },
  ingredients: IngredientText[],
  exclusions: Exclusion[],
): string[] {
  const words = new Set<string>();
  for (const ing of ingredients) {
    for (const text of [ing.canonicalName, ing.displayText]) {
      for (const word of normalizeHebrew(text).split(" ")) if (word) words.add(word);
    }
  }

  const found: string[] = [];
  for (const rule of exclusions) {
    const applies =
      rule.scope === "global" ||
      (rule.scope === "category" &&
        rule.categoryId !== null &&
        rule.categoryId === recipe.categoryId) ||
      (rule.scope === "recipe" && rule.recipeId === recipe.id);
    if (!applies) continue;

    for (const name of rule.ingredients) {
      const parts = normalizeHebrew(name).split(" ").filter(Boolean);
      if (parts.length > 0 && parts.every((p) => words.has(p)) && !found.includes(name)) {
        found.push(name);
      }
    }
  }
  return found;
}
