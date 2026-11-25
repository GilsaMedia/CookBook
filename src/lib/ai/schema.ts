import { z } from "zod";

/**
 * The AI's structured recipe (ai-server/tasks.mjs RECIPE_SCHEMA). The server
 * already enforces a JSON Schema; this checks it again before anything is
 * shown or saved, and narrows it to the database's enums and ranges.
 */
const section = z.enum([
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
]);
const dishRole = z.enum(["main", "side", "salad", "soup", "dessert", "pastry", "spread", "drink"]);
const score = z.number().min(0).max(1);

export const importedRecipeSchema = z.object({
  is_recipe: z.boolean(),
  title: z.string().trim().min(1).max(200),
  servings: z.number().positive().nullable(),
  prep_time: z.number().int().min(0).nullable(),
  cook_time: z.number().int().min(0).nullable(),
  dish_role: dishRole.nullable(),
  uses_oven: z.boolean(),
  oven_temp: z.number().int().min(50).max(300).nullable(),
  uses_stovetop: z.boolean(),
  make_ahead: z.boolean(),
  cuisine: z.string().nullable(),
  source_language: z.string(),
  ingredients: z.array(
    z.object({
      display_text: z.string().trim().min(1),
      quantity: z.number().positive().nullable(),
      unit: z.enum(["g", "ml", "unit"]).nullable(),
      canonical_name: z.string().nullable(),
      section,
      optional: z.boolean(),
    }),
  ),
  steps: z.array(z.string().trim().min(1)),
  confidence: z.object({ title: score, ingredients: score, steps: score, times: score }),
});

export const importResponseSchema = z.object({
  result: importedRecipeSchema,
  source: z
    .object({ url: z.string(), name: z.string().nullable(), image: z.string().nullable() })
    .nullable(),
});

export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type ImportResponse = z.infer<typeof importResponseSchema>;
export type IngredientSection = z.infer<typeof section>;
