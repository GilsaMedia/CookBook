import type { Database } from "@/lib/supabase/database.types";
import { normalizeHebrew } from "@/lib/search/hebrew";

/**
 * The shopping list (PRD §8.4): one per meal, built here from the meal's
 * dishes without any AI. The same ingredient in a compatible unit is added
 * up across dishes (and scaled to each dish's servings), rounded to an
 * amount you can buy, grouped by store section in the PRD's order, and
 * pantry staples start out as "already at home".
 */

export type Section = Database["public"]["Enums"]["ingredient_section"];
export type Unit = Database["public"]["Enums"]["ingredient_unit"];

/** The store's sections, in the order the family walks them (PRD §6). */
export const SECTION_ORDER: Section[] = [
  "produce",
  "bakery",
  "dairy_eggs",
  "meat_fish",
  "frozen",
  "canned_sauces",
  "dry_goods",
  "baking",
  "spices_oils",
  "nuts_dried_fruit",
  "drinks",
  "other",
];

/**
 * Staples most kitchens have (PRD §8.4), and tap water; a book can keep its
 * own list.
 */
export const DEFAULT_PANTRY = [
  "מים",
  "שמן זית",
  "שמן קנולה",
  "מלח",
  "פלפל שחור",
  "קמח",
  "סוכר",
  "פפריקה",
  "כמון",
  "כורכום",
  "אבקת שום",
  "אורגנו",
  "קינמון",
  "חומץ",
  "רוטב סויה",
];

export type Dish = {
  recipeId: string;
  title: string;
  /** The servings chosen for the meal, and the recipe's own. */
  servings: number | null;
  recipeServings: number | null;
};

export type IngredientLine = {
  recipeId: string;
  displayText: string;
  canonicalName: string | null;
  quantity: number | null;
  unit: Unit | null;
  section: Section;
  optional: boolean;
};

export type ListItem = {
  /** What the item is, across rebuilds: its name and unit family. */
  key: string;
  name: string;
  /** The exact total, and the amount to buy (rounded up). Null: no amount. */
  quantity: number | null;
  buy: number | null;
  unit: Unit | null;
  section: Section;
  /** The dishes it's for, in meal order. */
  sources: string[];
  /** A pantry staple: starts out as already at home. */
  pantry: boolean;
};

/** An ingredient's name for the list: its canonical name, else its text. */
const nameOf = (i: IngredientLine) => i.canonicalName?.trim() || i.displayText.trim();

/** The key an ingredient merges under: the name, and the unit when it has an amount. */
export const keyOf = (i: IngredientLine) =>
  `${normalizeHebrew(nameOf(i))}|${i.quantity !== null && i.unit ? i.unit : "-"}`;

/**
 * An amount you can buy: grams and ml up to the next 50 (the next 5 below
 * 50, for spices and spoons), the next 100 above 1 kg / 1 l; counts up to
 * a whole one.
 */
export function roundToBuy(quantity: number, unit: Unit): number {
  if (unit === "unit") return Math.ceil(quantity - 1e-9);
  const step = quantity < 50 ? 5 : quantity <= 1000 ? 50 : 100;
  return Math.ceil(quantity / step - 1e-9) * step;
}

export function buildShoppingList(
  dishes: Dish[],
  ingredients: IngredientLine[],
  pantry: string[] = DEFAULT_PANTRY,
): ListItem[] {
  const pantrySet = new Set(pantry.map((p) => normalizeHebrew(p)));
  const dishById = new Map(dishes.map((d) => [d.recipeId, d]));
  const order = new Map(dishes.map((d, i) => [d.recipeId, i]));
  const items = new Map<string, ListItem & { from: Set<string> }>();

  for (const line of ingredients) {
    const dish = dishById.get(line.recipeId);
    if (!dish || line.optional) continue;
    const key = keyOf(line);
    const factor = dish.servings && dish.recipeServings ? dish.servings / dish.recipeServings : 1;
    const amount = line.quantity !== null && line.unit ? line.quantity * factor : null;
    const item = items.get(key) ?? {
      key,
      name: nameOf(line),
      quantity: amount === null ? null : 0,
      buy: null,
      unit: amount === null ? null : line.unit,
      section: line.section,
      sources: [],
      pantry: pantrySet.has(normalizeHebrew(nameOf(line))),
      from: new Set<string>(),
    };
    if (amount !== null && item.quantity !== null) item.quantity += amount;
    item.from.add(dish.recipeId);
    items.set(key, item);
  }

  const byName = new Intl.Collator("he").compare;
  return [...items.values()]
    .map(({ from, ...item }) => ({
      ...item,
      quantity: item.quantity === null ? null : Math.round(item.quantity * 100) / 100,
      buy: item.quantity === null || !item.unit ? null : roundToBuy(item.quantity, item.unit),
      sources: [...from]
        .sort((a, b) => order.get(a)! - order.get(b)!)
        .map((id) => dishById.get(id)!.title),
    }))
    .sort(
      (a, b) =>
        SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
        byName(a.name, b.name),
    );
}

/** What the stored list keeps between rebuilds. */
export type Marks = { checked: boolean; inPantry: boolean };

/**
 * A rebuilt list against the stored one: items still on it keep their
 * marks (checked, at home); new ones start unchecked, at home if they're
 * pantry staples; the rest go.
 */
export function mergeMarks<T extends Marks & { key: string }>(
  stored: T[],
  built: ListItem[],
): { items: (ListItem & Marks)[]; removed: T[] } {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const keys = new Set(built.map((b) => b.key));
  return {
    items: built.map((b) => {
      const s = byKey.get(b.key);
      return { ...b, checked: s?.checked ?? false, inPantry: s ? s.inPantry : b.pantry };
    }),
    removed: stored.filter((s) => !keys.has(s.key)),
  };
}
