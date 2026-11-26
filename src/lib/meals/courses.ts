import type { DishRole, RecipeCard } from "@/lib/recipes/types";

/**
 * What a family meal usually has (PRD §13.1, a first step toward the menu
 * builder): the meal screen shows the courses still missing, with a few
 * dishes of that kind from the book to add.
 */
export const COURSES: { role: DishRole; target: number }[] = [
  { role: "main", target: 1 },
  { role: "side", target: 1 },
  { role: "salad", target: 2 },
  { role: "dessert", target: 1 },
];

export type CourseGap = {
  role: DishRole;
  have: number;
  target: number;
  suggestions: RecipeCard[];
};

/** A stable shuffle: the same meal shows the same suggestions on every visit. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (id: string) => {
    let x = h;
    for (const c of id) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
    return x >>> 0;
  };
}

export function courseGaps(
  meal: { id: string; items: { recipeId: string; dishRole: DishRole | null }[] },
  library: RecipeCard[],
  perCourse = 3,
): CourseGap[] {
  const inMeal = new Set(meal.items.map((i) => i.recipeId));
  const rank = seeded(meal.id);
  return COURSES.map(({ role, target }) => {
    const have = meal.items.filter((i) => i.dishRole === role).length;
    const suggestions = library
      .filter((r) => r.dishRole === role && !inMeal.has(r.id))
      .sort((a, b) => rank(a.id) - rank(b.id))
      .slice(0, perCourse);
    return { role, have, target, suggestions };
  }).filter((g) => g.have < g.target && g.suggestions.length > 0);
}
