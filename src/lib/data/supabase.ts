import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { Exclusion, ImageCredit, Library, RecipeDetail } from "@/lib/recipes/types";
import { assembleLibrary, assembleRecipe } from "./assemble";
import { pickMembership } from "./current-book";

const IMAGE_BUCKET = "recipe-images";
// Signed image links last an hour; screens reload data when opened.
const IMAGE_TTL_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = SupabaseClient<Database>;

/**
 * The book the library shows: the one the user owns, else the first book
 * they were invited to. RLS already hides revoked memberships' content;
 * the filter here just avoids picking a revoked book.
 */
async function currentBook(db: Db) {
  const { data, error } = await db
    .from("book_members")
    .select("book_id, role, books(name)")
    .is("revoked_at", null)
    .order("created_at");
  if (error) throw error;
  const membership = pickMembership(data);
  return membership
    ? {
        id: membership.book_id,
        name: membership.books?.name ?? null,
        isOwner: membership.role === "owner",
      }
    : null;
}

async function exclusions(db: Db, bookId: string): Promise<Exclusion[]> {
  const { data, error } = await db
    .from("preferences")
    .select("scope, category_id, recipe_id, excluded_ingredients")
    .eq("book_id", bookId);
  if (error) throw error;
  return data.map((p) => ({
    scope: p.scope,
    categoryId: p.category_id,
    recipeId: p.recipe_id,
    ingredients: p.excluded_ingredients,
  }));
}

/**
 * Signed URLs for each recipe's first image (images are private, PRD §11),
 * and the credit of a photo that came from the web.
 */
async function firstImages(db: Db, bookId: string, recipeIds?: string[]) {
  let query = db
    .from("recipe_images")
    .select("recipe_id, storage_path, credit_name, credit_url")
    .eq("book_id", bookId)
    .order("position");
  if (recipeIds) query = query.in("recipe_id", recipeIds);
  const { data, error } = await query;
  if (error) throw error;

  const first = new Map<string, string>();
  const urls = new Map<string, string>();
  const credits = new Map<string, ImageCredit>();
  for (const img of data) {
    if (first.has(img.recipe_id)) continue;
    first.set(img.recipe_id, img.storage_path);
    if (img.credit_name && img.credit_url)
      credits.set(img.recipe_id, {
        author: img.credit_name,
        license: "",
        sourceUrl: img.credit_url,
      });
  }
  if (first.size === 0) return { urls, credits };

  const { data: signed } = await db.storage
    .from(IMAGE_BUCKET)
    .createSignedUrls([...first.values()], IMAGE_TTL_SECONDS);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  for (const [recipeId, path] of first) {
    const url = byPath.get(path);
    if (url) urls.set(recipeId, url);
  }
  return { urls, credits };
}

const RECIPE_COLUMNS =
  "id, title, category_id, prep_time, cook_time, search_text, source_name, source_url, servings, cuisine, dish_role, tags, created_at";

/** The signed-in user's library. Viewers only get approved recipes (RLS). */
export async function supabaseLibrary(): Promise<Library> {
  const db = supabase();
  const book = await currentBook(db);
  if (!book) return { bookName: null, categories: [], recipes: [] };

  const [categories, recipes, ingredients, rules, images] = await Promise.all([
    db.from("categories").select("id, name, position").eq("book_id", book.id),
    db.from("recipes").select(RECIPE_COLUMNS).eq("book_id", book.id).eq("status", "approved"),
    db
      .from("ingredients")
      .select("id, recipe_id, display_text, canonical_name, optional, position")
      .eq("book_id", book.id),
    exclusions(db, book.id),
    firstImages(db, book.id),
  ]);
  for (const r of [categories, recipes, ingredients]) if (r.error) throw r.error;

  const library = assembleLibrary({
    bookName: book.name,
    categories: categories.data ?? [],
    recipes: recipes.data ?? [],
    ingredients: ingredients.data ?? [],
    exclusions: rules,
    images: images.urls,
  });
  return { ...library, bookId: book.id, isOwner: book.isOwner };
}

/** One recipe, or null when it doesn't exist or RLS hides it. */
export async function supabaseRecipe(id: string): Promise<RecipeDetail | null> {
  if (!UUID.test(id)) return null;
  const db = supabase();
  const { data: recipe, error } = await db
    .from("recipes")
    .select(`${RECIPE_COLUMNS}, book_id, categories(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!recipe) return null;

  const [ingredients, steps, rules, images] = await Promise.all([
    db
      .from("ingredients")
      .select("id, recipe_id, display_text, canonical_name, optional, position")
      .eq("recipe_id", id),
    db.from("steps").select("id, recipe_id, text, position").eq("recipe_id", id),
    exclusions(db, recipe.book_id),
    firstImages(db, recipe.book_id, [id]),
  ]);
  for (const r of [ingredients, steps]) if (r.error) throw r.error;

  return assembleRecipe({
    recipe,
    categoryName: recipe.categories?.name ?? null,
    ingredients: ingredients.data ?? [],
    steps: steps.data ?? [],
    exclusions: rules,
    imageUrl: images.urls.get(id) ?? null,
    imageCredit: images.credits.get(id) ?? null,
  });
}
