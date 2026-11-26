import { supabase } from "@/lib/supabase/client";
import {
  buildShoppingList,
  DEFAULT_PANTRY,
  mergeMarks,
  type Dish,
  type IngredientLine,
  type ListItem,
  type Marks,
} from "@/lib/shopping";
import { getMeal, type Meal } from "./meals";

/**
 * The stored shopping list of a meal (migration 20261126150000_shopping):
 * rebuilt from the meal whenever it's opened or the meal changes, keeping
 * what's checked off and what's already at home.
 */

export type StoredItem = ListItem & Marks & { id: string };
export type ShoppingList = { id: string | null; doneAt: string | null; items: StoredItem[] };
export type MealList = {
  meal: Meal;
  dishes: Dish[];
  /** Every ingredient line of the meal's dishes (for "מצרכים (3/9 בבית)"). */
  lines: IngredientLine[];
  list: ShoppingList;
};

/** The meal's dishes and their ingredient lines, and the book's pantry. */
async function mealInputs(meal: Meal) {
  const db = supabase();
  const ids = [...new Set(meal.items.map((i) => i.recipeId))];
  const [recipes, ingredients, book] = await Promise.all([
    ids.length
      ? db.from("recipes").select("id, servings").in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db
          .from("ingredients")
          .select(
            "recipe_id, display_text, canonical_name, quantity, unit, section, optional, position",
          )
          .in("recipe_id", ids)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    db.from("books").select("pantry").eq("id", meal.bookId).maybeSingle(),
  ]);
  if (recipes.error) throw recipes.error;
  if (ingredients.error) throw ingredients.error;
  const servings = new Map((recipes.data ?? []).map((r) => [r.id, r.servings]));
  const dishes: Dish[] = meal.items.map((i) => ({
    recipeId: i.recipeId,
    title: i.title,
    servings: i.servings,
    recipeServings: servings.get(i.recipeId) ?? null,
  }));
  const lines: IngredientLine[] = (ingredients.data ?? []).map((i) => ({
    recipeId: i.recipe_id,
    displayText: i.display_text,
    canonicalName: i.canonical_name,
    quantity: i.quantity,
    unit: i.unit,
    section: i.section,
    optional: i.optional,
  }));
  return { dishes, lines, pantry: book.data?.pantry ?? DEFAULT_PANTRY };
}

const toStored = (row: {
  id: string;
  key: string;
  name: string;
  quantity: number | null;
  buy: number | null;
  unit: StoredItem["unit"];
  section: StoredItem["section"];
  sources: string[];
  checked: boolean;
  in_pantry: boolean;
}): StoredItem => ({
  id: row.id,
  key: row.key,
  name: row.name,
  quantity: row.quantity,
  buy: row.buy,
  unit: row.unit,
  section: row.section,
  sources: row.sources,
  pantry: false,
  checked: row.checked,
  inPantry: row.in_pantry,
});

const ITEM_COLUMNS = "id, key, name, quantity, buy, unit, section, sources, checked, in_pantry";

/**
 * Builds the meal's list and brings the stored one up to date: items no
 * dish needs any more go, new ones come in (pantry staples as already at
 * home), and everything still on it keeps its marks. Viewers, who can't
 * change the list, get it as stored and freshly built.
 */
export async function syncList(mealId: string, canPlan: boolean): Promise<MealList | null> {
  const db = supabase();
  const meal = await getMeal(mealId);
  if (!meal) return null;
  const { dishes, lines, pantry } = await mealInputs(meal);
  const built = buildShoppingList(dishes, lines, pantry);

  let { data: list } = await db
    .from("shopping_lists")
    .select("id, done_at")
    .eq("meal_id", meal.id)
    .maybeSingle();
  if (!list && canPlan) {
    await db
      .from("shopping_lists")
      .upsert(
        { meal_id: meal.id, book_id: meal.bookId },
        { onConflict: "meal_id", ignoreDuplicates: true },
      );
    ({ data: list } = await db
      .from("shopping_lists")
      .select("id, done_at")
      .eq("meal_id", meal.id)
      .maybeSingle());
  }

  const { data: rows } = list
    ? await db.from("shopping_items").select(ITEM_COLUMNS).eq("list_id", list.id)
    : { data: [] };
  const stored = (rows ?? []).map(toStored);
  const { items, removed } = mergeMarks(stored, built);

  if (list && canPlan) {
    const byKey = new Map(stored.map((s) => [s.key, s]));
    const changed = items.filter((i) => {
      const s = byKey.get(i.key);
      return (
        !s ||
        s.quantity !== i.quantity ||
        s.buy !== i.buy ||
        s.section !== i.section ||
        s.sources.join("|") !== i.sources.join("|")
      );
    });
    if (removed.length)
      await db
        .from("shopping_items")
        .delete()
        .in(
          "id",
          removed.map((r) => r.id),
        );
    if (changed.length)
      await db.from("shopping_items").upsert(
        changed.map((i) => ({
          list_id: list.id,
          book_id: meal.bookId,
          key: i.key,
          name: i.name,
          quantity: i.quantity,
          buy: i.buy,
          unit: i.unit,
          section: i.section,
          sources: i.sources,
          checked: i.checked,
          in_pantry: i.inPantry,
        })),
        { onConflict: "list_id,key" },
      );
    if (removed.length || changed.length) {
      const { data: fresh } = await db
        .from("shopping_items")
        .select(ITEM_COLUMNS)
        .eq("list_id", list.id);
      const freshByKey = new Map((fresh ?? []).map((f) => [f.key, f.id]));
      return {
        meal,
        dishes,
        lines,
        list: {
          id: list.id,
          doneAt: list.done_at,
          items: items.map((i) => ({ ...i, id: freshByKey.get(i.key) ?? i.key })),
        },
      };
    }
  }
  const idByKey = new Map(stored.map((s) => [s.key, s.id]));
  return {
    meal,
    dishes,
    lines,
    list: {
      id: list?.id ?? null,
      doneAt: list?.done_at ?? null,
      items: items.map((i) => ({ ...i, id: idByKey.get(i.key) ?? i.key })),
    },
  };
}

export async function setChecked(itemId: string, checked: boolean) {
  const { error } = await supabase().from("shopping_items").update({ checked }).eq("id", itemId);
  if (error) throw error;
}

/** "יש בבית": off the list (into "כבר יש בבית"), or back onto it. */
export async function setInPantry(itemId: string, inPantry: boolean) {
  const { error } = await supabase()
    .from("shopping_items")
    .update({ in_pantry: inPantry })
    .eq("id", itemId);
  if (error) throw error;
}

/** "סיימתי". */
export async function finishList(listId: string) {
  const { error } = await supabase()
    .from("shopping_lists")
    .update({ done_at: new Date().toISOString() })
    .eq("id", listId);
  if (error) throw error;
}
