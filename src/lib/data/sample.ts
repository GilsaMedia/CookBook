import { withBase } from "@/lib/demo";
import { normalizeHebrew } from "@/lib/search/hebrew";
import type { DishRole, Exclusion, ImageCredit } from "@/lib/recipes/types";
import type { Database } from "@/lib/supabase/database.types";
import type { CategoryRow, IngredientRow, RecipeRow, StepRow } from "./assemble";
import sample from "./sample-recipes.json";

type Section = Database["public"]["Enums"]["ingredient_section"];
type Unit = Database["public"]["Enums"]["ingredient_unit"];

/** One recipe as written in sample-recipes.json (DB column names). */
export type SampleRecipe = {
  id: string;
  title: string;
  category: string;
  source_name: string | null;
  source_url: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  dish_role: DishRole | null;
  cuisine: string | null;
  uses_oven: boolean;
  oven_temp: number | null;
  uses_stovetop: boolean;
  make_ahead: boolean;
  ingredients: {
    display_text: string;
    quantity: number | null;
    unit: Unit | null;
    canonical_name: string | null;
    section: Section;
    optional: boolean;
  }[];
  steps: string[];
  /** A photo in public/sample-photos, with its Commons attribution. */
  image: { file: string; author: string; license: string; source_url: string } | null;
};

export const SAMPLE_BOOK_NAME: string = sample.bookName;
export const SAMPLE_RECIPES = sample.recipes as SampleRecipe[];

/** The default categories every new book starts with (PRD Appendix A, signup migration). */
export const DEFAULT_CATEGORIES = [
  "מרקים",
  "סלטים",
  "מנות עיקריות – בשר ועוף",
  "דגים",
  "צמחוני וטבעוני",
  "תוספות",
  "פסטה ואורז",
  "מאפים ולחמים",
  "עוגות",
  "קינוחים ועוגיות",
  "ממרחים ורטבים",
];

const categoryId = (name: string) => `category-${DEFAULT_CATEGORIES.indexOf(name) + 1}`;

/** The sample book as database rows, for the demo build (no Supabase). */
export function sampleRows() {
  const categories: CategoryRow[] = DEFAULT_CATEGORIES.map((name, i) => ({
    id: categoryId(name),
    name,
    position: i + 1,
  }));

  const recipes: RecipeRow[] = [];
  const ingredients: IngredientRow[] = [];
  const steps: StepRow[] = [];
  for (const r of SAMPLE_RECIPES) {
    recipes.push({
      id: r.id,
      title: r.title,
      category_id: categoryId(r.category),
      prep_time: r.prep_time,
      cook_time: r.cook_time,
      // Same text the database trigger builds: title + canonical names.
      search_text: normalizeHebrew(
        [r.title, ...r.ingredients.map((i) => i.canonical_name ?? i.display_text)].join(" "),
      ),
      source_name: r.source_name,
      source_url: r.source_url,
      servings: r.servings,
      cuisine: r.cuisine,
      dish_role: r.dish_role,
    });
    r.ingredients.forEach((ing, position) =>
      ingredients.push({
        id: `${r.id}-i${position}`,
        recipe_id: r.id,
        display_text: ing.display_text,
        canonical_name: ing.canonical_name,
        optional: ing.optional,
        position,
      }),
    );
    r.steps.forEach((text, position) =>
      steps.push({ id: `${r.id}-s${position}`, recipe_id: r.id, text, position }),
    );
  }

  // Demo photos are static files; the real app signs Storage URLs instead.
  const images = new Map<string, string>();
  const credits = new Map<string, ImageCredit>();
  for (const r of SAMPLE_RECIPES) {
    if (!r.image) continue;
    images.set(r.id, withBase(`/sample-photos/${r.image.file}`));
    credits.set(r.id, {
      author: r.image.author,
      license: r.image.license,
      sourceUrl: r.image.source_url,
    });
  }

  const byTitle = new Map(SAMPLE_RECIPES.map((r) => [r.title, r.id]));
  const exclusions: Exclusion[] = sample.exclusions.map((e) => ({
    scope: e.scope as Exclusion["scope"],
    categoryId: e.category ? categoryId(e.category) : null,
    recipeId: e.recipe ? (byTitle.get(e.recipe) ?? null) : null,
    ingredients: e.ingredients,
  }));

  return { categories, recipes, ingredients, steps, exclusions, images, credits };
}
