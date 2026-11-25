import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Meals (migration 20261126090000_meals.sql). The book's draft meal is its
 * tray; saving gives it a title and a date.
 */

export type MealStatus = Database["public"]["Enums"]["meal_status"];

export type MealSummary = {
  id: string;
  title: string;
  date: string | null;
  status: MealStatus;
  dishes: number;
};

export type MealItem = {
  id: string;
  mealId: string;
  bookId: string;
  recipeId: string;
  title: string;
  servings: number | null;
  position: number;
};

export type Meal = MealSummary & { bookId: string; items: MealItem[] };

/** Thrown when the database says no (not_found, or a policy). */
export class MealError extends Error {}

/** "הוספה לארוחה": onto the recipe's book's tray. Resolves with the tray's id. */
export async function addToTray(recipeId: string): Promise<string> {
  const { data, error } = await supabase().rpc("add_to_tray", { p_recipe: recipeId });
  if (error) throw new MealError(error.message);
  return data;
}

/** The book's tray, if it has one: its id and how many dishes. */
export async function getTray(bookId: string): Promise<{ id: string; count: number } | null> {
  const { data, error } = await supabase()
    .from("meals")
    .select("id, meal_items(count)")
    .eq("book_id", bookId)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const count = (data.meal_items as unknown as { count: number }[])[0]?.count ?? 0;
  return { id: data.id, count };
}

/** The tray first, then saved meals, latest date first. */
export async function listMeals(bookId: string): Promise<MealSummary[]> {
  const { data, error } = await supabase()
    .from("meals")
    .select("id, title, date, status, meal_items(count)")
    .eq("book_id", bookId)
    .order("date", { ascending: false, nullsFirst: true })
    .limit(100);
  if (error) throw error;
  return data
    .map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      status: m.status,
      dishes: (m.meal_items as unknown as { count: number }[])[0]?.count ?? 0,
    }))
    .sort((a, b) => Number(b.status === "draft") - Number(a.status === "draft"));
}

export async function getMeal(id: string): Promise<Meal | null> {
  const { data, error } = await supabase()
    .from("meals")
    .select(
      "id, book_id, title, date, status, meal_items(id, meal_id, book_id, recipe_id, servings, position, recipes(title))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const items = (data.meal_items ?? [])
    .map((i) => ({
      id: i.id,
      mealId: i.meal_id,
      bookId: i.book_id,
      recipeId: i.recipe_id,
      title: i.recipes?.title ?? "",
      servings: i.servings,
      position: i.position,
    }))
    .sort((a, b) => a.position - b.position);
  return {
    id: data.id,
    bookId: data.book_id,
    title: data.title,
    date: data.date,
    status: data.status,
    dishes: items.length,
    items,
  };
}

/** Saves the tray (or edits a meal): title, date and, for the tray, status 'done'. */
export async function updateMeal(
  id: string,
  change: { title?: string; date?: string | null; status?: MealStatus },
) {
  const { error } = await supabase().from("meals").update(change).eq("id", id);
  if (error) throw new MealError(error.message);
}

export async function deleteMeal(id: string) {
  const { error } = await supabase().from("meals").delete().eq("id", id);
  if (error) throw new MealError(error.message);
}

/** A recipe's own servings: what a dish starts with. */
export async function recipeServings(recipeId: string): Promise<number | null> {
  const { data } = await supabase()
    .from("recipes")
    .select("servings")
    .eq("id", recipeId)
    .maybeSingle();
  return data?.servings ?? null;
}

/** Adds a dish at the end of a meal. */
export async function addItem(meal: Meal, recipeId: string, servings: number | null) {
  const position = Math.max(-1, ...meal.items.map((i) => i.position)) + 1;
  const { error } = await supabase()
    .from("meal_items")
    .insert({ meal_id: meal.id, book_id: meal.bookId, recipe_id: recipeId, servings, position });
  if (error) throw new MealError(error.message);
}

/** "החלפה": another recipe in the same place. */
export async function swapItem(itemId: string, recipeId: string, servings: number | null) {
  const { error } = await supabase()
    .from("meal_items")
    .update({ recipe_id: recipeId, servings })
    .eq("id", itemId);
  if (error) throw new MealError(error.message);
}

export async function setServings(itemId: string, servings: number) {
  const { error } = await supabase().from("meal_items").update({ servings }).eq("id", itemId);
  if (error) throw new MealError(error.message);
}

/** "הסרה". Keep the item to put it back with `restoreItem` ("בטל"). */
export async function removeItem(itemId: string) {
  const { error } = await supabase().from("meal_items").delete().eq("id", itemId);
  if (error) throw new MealError(error.message);
}

export async function restoreItem(item: MealItem) {
  const { error } = await supabase().from("meal_items").insert({
    id: item.id,
    meal_id: item.mealId,
    book_id: item.bookId,
    recipe_id: item.recipeId,
    servings: item.servings,
    position: item.position,
  });
  if (error) throw new MealError(error.message);
}
