import { isDemo } from "@/lib/demo";
import type { Library, RecipeDetail } from "@/lib/recipes/types";
import { assembleLibrary, assembleRecipe } from "./assemble";
import { SAMPLE_BOOK_NAME, sampleRows } from "./sample";

function demoLibrary(): Library {
  const rows = sampleRows();
  return assembleLibrary({ bookName: SAMPLE_BOOK_NAME, ...rows, images: new Map() });
}

function demoRecipe(id: string): RecipeDetail | null {
  const rows = sampleRows();
  const recipe = rows.recipes.find((r) => r.id === id);
  if (!recipe) return null;
  return assembleRecipe({
    recipe,
    categoryName: rows.categories.find((c) => c.id === recipe.category_id)?.name ?? null,
    ingredients: rows.ingredients.filter((i) => i.recipe_id === id),
    steps: rows.steps.filter((s) => s.recipe_id === id),
    exclusions: rows.exclusions,
    imageUrl: null,
  });
}

/** The current book's library: Supabase, or the sample book in demo mode. */
export async function getLibrary(): Promise<Library> {
  if (isDemo) return demoLibrary();
  const { supabaseLibrary } = await import("./supabase");
  return supabaseLibrary();
}

/** One recipe, or null if it doesn't exist or the user can't see it. */
export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  if (isDemo) return demoRecipe(id);
  const { supabaseRecipe } = await import("./supabase");
  return supabaseRecipe(id);
}

/** Recipe ids to prerender. Only the static demo build knows them up front. */
export function staticRecipeIds(): string[] {
  return isDemo ? sampleRows().recipes.map((r) => r.id) : [];
}
