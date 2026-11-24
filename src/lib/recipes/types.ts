import type { Database } from "@/lib/supabase/database.types";

export type DishRole = Database["public"]["Enums"]["dish_role"];

/** A category chip in the library, with how many visible recipes it holds. */
export type CategorySummary = {
  id: string;
  name: string;
  count: number;
};

/** What a library card needs. */
export type RecipeCard = {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  /** prep + cook, in minutes; null when neither is known. */
  totalMinutes: number | null;
  imageUrl: string | null;
  /** Normalized title + ingredient names (see `normalizeHebrew`). */
  searchText: string;
  /** Excluded ingredients this recipe contains (§10). Empty when none. */
  warnings: string[];
};

export type RecipeIngredient = {
  id: string;
  displayText: string;
  optional: boolean;
};

export type RecipeStep = {
  id: string;
  text: string;
};

/** Attribution for a photo that isn't the family's own (e.g. the demo's Commons photos). */
export type ImageCredit = { author: string; license: string; sourceUrl: string };

/** Everything the recipe page shows. */
export type RecipeDetail = Omit<RecipeCard, "searchText"> & {
  imageCredit: ImageCredit | null;
  sourceName: string | null;
  sourceUrl: string | null;
  servings: number | null;
  cuisine: string | null;
  dishRole: DishRole | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export type Library = {
  bookName: string | null;
  categories: CategorySummary[];
  recipes: RecipeCard[];
};

/** An exclusion rule from the `preferences` table. */
export type Exclusion = {
  scope: Database["public"]["Enums"]["preference_scope"];
  categoryId: string | null;
  recipeId: string | null;
  ingredients: string[];
};
