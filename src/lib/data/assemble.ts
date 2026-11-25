import { findExcluded } from "@/lib/recipes/exclusions";
import { normalizeHebrew } from "@/lib/search/hebrew";
import type {
  CategorySummary,
  DishRole,
  Exclusion,
  ImageCredit,
  Library,
  RecipeCard,
  RecipeDetail,
} from "@/lib/recipes/types";

/** Rows as the database returns them. The demo source builds the same shapes. */
export type CategoryRow = { id: string; name: string; position: number };
export type RecipeRow = {
  id: string;
  title: string;
  category_id: string | null;
  prep_time: number | null;
  cook_time: number | null;
  search_text: string;
  source_name: string | null;
  source_url: string | null;
  servings: number | null;
  cuisine: string | null;
  dish_role: DishRole | null;
};
export type IngredientRow = {
  id: string;
  recipe_id: string;
  display_text: string;
  canonical_name: string | null;
  optional: boolean;
  position: number;
};
export type StepRow = { id: string; recipe_id: string; text: string; position: number };

const totalMinutes = (r: RecipeRow) =>
  r.prep_time === null && r.cook_time === null ? null : (r.prep_time ?? 0) + (r.cook_time ?? 0);

const toText = (i: IngredientRow) => ({
  canonicalName: i.canonical_name,
  displayText: i.display_text,
});

function card(
  r: RecipeRow,
  categoryName: string | null,
  ingredients: IngredientRow[],
  exclusions: Exclusion[],
  imageUrl: string | null,
): RecipeCard {
  return {
    id: r.id,
    title: r.title,
    categoryId: r.category_id,
    categoryName,
    totalMinutes: totalMinutes(r),
    imageUrl,
    searchText: r.search_text,
    warnings: findExcluded(
      { id: r.id, categoryId: r.category_id },
      ingredients.map(toText),
      exclusions,
    ),
    ingredientNames: [
      ...new Set(ingredients.map((i) => normalizeHebrew(i.canonical_name ?? i.display_text))),
    ].filter(Boolean),
    sourceUrl: r.source_url,
  };
}

/**
 * Builds the library view: cards sorted by title (Hebrew collation) and the
 * category chips that have at least one visible recipe, in the book's order.
 */
export function assembleLibrary(input: {
  bookName: string | null;
  categories: CategoryRow[];
  recipes: RecipeRow[];
  ingredients: IngredientRow[];
  exclusions: Exclusion[];
  images: Map<string, string>;
}): Library {
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  const byRecipe = new Map<string, IngredientRow[]>();
  for (const ing of input.ingredients) {
    const list = byRecipe.get(ing.recipe_id) ?? [];
    list.push(ing);
    byRecipe.set(ing.recipe_id, list);
  }

  const byTitle = new Intl.Collator("he").compare;
  const recipes = [...input.recipes]
    .sort((a, b) => byTitle(a.title, b.title))
    .map((r) =>
      card(
        r,
        r.category_id ? (names.get(r.category_id) ?? null) : null,
        byRecipe.get(r.id) ?? [],
        input.exclusions,
        input.images.get(r.id) ?? null,
      ),
    );

  const counts = new Map<string, number>();
  for (const r of recipes) {
    if (r.categoryId) counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
  }
  const categories: CategorySummary[] = [...input.categories]
    .sort((a, b) => a.position - b.position)
    .filter((c) => counts.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }));

  return { bookName: input.bookName, categories, recipes };
}

/** Builds the recipe page view. Ingredients and steps come back in position order. */
export function assembleRecipe(input: {
  recipe: RecipeRow;
  categoryName: string | null;
  ingredients: IngredientRow[];
  steps: StepRow[];
  exclusions: Exclusion[];
  imageUrl: string | null;
  imageCredit?: ImageCredit | null;
}): RecipeDetail {
  const { recipe } = input;
  const ingredients = [...input.ingredients].sort((a, b) => a.position - b.position);
  const steps = [...input.steps].sort((a, b) => a.position - b.position);
  // The page doesn't search or check duplicates, so drop those fields.
  const {
    searchText: _searchText,
    ingredientNames: _names,
    sourceUrl: _sourceUrl,
    ...base
  } = card(recipe, input.categoryName, ingredients, input.exclusions, input.imageUrl);
  void [_searchText, _names, _sourceUrl];
  return {
    ...base,
    imageCredit: input.imageCredit ?? null,
    sourceName: recipe.source_name,
    sourceUrl: recipe.source_url,
    servings: recipe.servings,
    cuisine: recipe.cuisine,
    dishRole: recipe.dish_role,
    ingredients: ingredients.map((i) => ({
      id: i.id,
      displayText: i.display_text,
      optional: i.optional,
    })),
    steps: steps.map((s) => ({ id: s.id, text: s.text })),
  };
}
