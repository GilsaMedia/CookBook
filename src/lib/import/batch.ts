import { findDuplicates } from "@/lib/recipes/duplicates";
import type { RecipeCard } from "@/lib/recipes/types";
import { normalizeHebrew } from "@/lib/search/hebrew";

/** An imported recipe, as far as duplicate checks need. */
export type BatchItem = {
  id: string;
  title: string;
  ingredientNames: string[];
  sourceUrl: string | null;
  /** How much the recipe holds; "merge" keeps the fullest one. */
  size: number;
};

export type DuplicateGroup = {
  key: string;
  /** Imported items in the group, in file order. */
  items: string[];
  /** Recipes already in the book that the group matches. */
  library: RecipeCard[];
};

export type Decision = "merge" | "keepBoth" | "skip";

const asCard = (i: BatchItem) =>
  ({
    id: i.id,
    title: i.title,
    ingredientNames: i.ingredientNames.map((n) => normalizeHebrew(n)),
    sourceUrl: i.sourceUrl,
  }) as RecipeCard;

/**
 * Groups likely duplicates (PRD §7.3): imported recipes that look alike
 * (same link, similar title, mostly the same ingredients), with any
 * recipes already in the book that they match.
 */
export function groupDuplicates(items: BatchItem[], library: RecipeCard[]): DuplicateGroup[] {
  const parent = items.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (findDuplicates(items[i], [asCard(items[j])]).length) parent[root(j)] = root(i);
    }
  }
  type Group = { items: number[]; library: Map<string, RecipeCard> };
  const groups = new Map<number, Group>();
  items.forEach((item, i) => {
    const g: Group = groups.get(root(i)) ?? { items: [], library: new Map() };
    g.items.push(i);
    for (const r of findDuplicates(item, library)) g.library.set(r.id, r);
    groups.set(root(i), g);
  });
  return [...groups.values()]
    .filter((g) => g.items.length > 1 || g.library.size > 0)
    .map((g) => ({
      key: items[g.items[0]].id,
      items: g.items.map((i) => items[i].id),
      library: [...g.library.values()],
    }));
}

/**
 * Which imported items to save, given a decision per group. Merge keeps
 * the recipe already in the book if there is one, else the fullest import.
 */
export function itemsToSave(
  items: BatchItem[],
  groups: DuplicateGroup[],
  decisions: Map<string, Decision>,
): Set<string> {
  const save = new Set(items.map((i) => i.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const g of groups) {
    const decision = decisions.get(g.key) ?? "merge";
    if (decision === "keepBoth") continue;
    const keep =
      decision === "merge" && g.library.length === 0
        ? [...g.items].sort((a, b) => byId.get(b)!.size - byId.get(a)!.size)[0]
        : null;
    for (const id of g.items) if (id !== keep) save.delete(id);
  }
  return save;
}
