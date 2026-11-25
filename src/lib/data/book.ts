import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { ImportedRecipe } from "@/lib/ai/schema";
import { pickMembership } from "./current-book";

type Role = Database["public"]["Enums"]["member_role"];

export type CurrentBook = {
  id: string;
  name: string;
  role: Role;
  /** A contributor the owner trusts: their recipes go straight in. */
  canPublish: boolean;
  categories: { id: string; name: string }[];
};

/** The book the user works in: the one chosen on this device, else their own. */
export async function getCurrentBook(): Promise<CurrentBook | null> {
  const db = supabase();
  const { data, error } = await db
    .from("book_members")
    .select("book_id, role, can_publish, books(name)")
    .is("revoked_at", null)
    .order("created_at");
  if (error) throw error;
  const m = pickMembership(data);
  if (!m) return null;
  const { data: categories, error: cErr } = await db
    .from("categories")
    .select("id, name, position")
    .eq("book_id", m.book_id)
    .order("position");
  if (cErr) throw cErr;
  return {
    id: m.book_id,
    name: m.books?.name ?? "",
    role: m.role,
    canPublish: m.can_publish,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };
}

/** What the review screen saves: the AI's recipe after the cook's edits. */
export type RecipeDraft = Omit<ImportedRecipe, "is_recipe" | "confidence" | "source_language"> & {
  categoryId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
};

/**
 * Saves a reviewed recipe in one go: the recipe, then its ingredients and
 * steps. Owners publish directly; contributors' recipes wait for approval
 * (RLS enforces both). If a child insert fails, the recipe is removed so no
 * half-saved recipe is left behind.
 */
export async function saveRecipe(book: CurrentBook, d: RecipeDraft): Promise<string> {
  const db = supabase();
  const { data: recipe, error } = await db
    .from("recipes")
    .insert({
      book_id: book.id,
      category_id: d.categoryId,
      title: d.title.trim(),
      status: book.role === "owner" || book.canPublish ? "approved" : "pending",
      source_url: d.sourceUrl,
      source_name: d.sourceName,
      servings: d.servings,
      prep_time: d.prep_time,
      cook_time: d.cook_time,
      dish_role: d.dish_role,
      cuisine: d.cuisine,
      uses_oven: d.uses_oven,
      oven_temp: d.uses_oven ? d.oven_temp : null,
      uses_stovetop: d.uses_stovetop,
      make_ahead: d.make_ahead,
    })
    .select("id")
    .single();
  if (error) throw error;

  const rows = <T>(items: T[]) => items.map((item, position) => ({ position, item }));
  const ingredients = await db.from("ingredients").insert(
    rows(d.ingredients).map(({ position, item }) => ({
      recipe_id: recipe.id,
      book_id: book.id,
      position,
      ...item,
    })),
  );
  const steps = ingredients.error
    ? ingredients
    : await db.from("steps").insert(
        rows(d.steps).map(({ position, item }) => ({
          recipe_id: recipe.id,
          book_id: book.id,
          position,
          text: item,
        })),
      );
  if (ingredients.error || steps.error) {
    await db.from("recipes").delete().eq("id", recipe.id);
    throw ingredients.error ?? steps.error;
  }
  return recipe.id;
}

/** Copies the source page's photo into the book. Best effort: never blocks saving. */
export async function importSourceImage(
  bookId: string,
  recipeId: string,
  url: string,
  credit?: { name: string; url: string } | null,
) {
  const { error } = await supabase().functions.invoke("import-image", {
    body: { bookId, recipeId, url, credit: credit ?? undefined },
  });
  return !error;
}
