import type { DishRole, RecipeCard } from "@/lib/recipes/types";

/**
 * The family's menu (PRD §13.1, a first step toward the menu builder): a
 * first course or soup, two mains, two salads and a dessert. The meal
 * screen shows every course with how many it has, and dishes from the book
 * for the ones still short.
 */
export type Course = "first" | "main" | "salad" | "dessert";

export const COURSES: { course: Course; target: number }[] = [
  { course: "first", target: 1 },
  { course: "main", target: 2 },
  { course: "salad", target: 2 },
  { course: "dessert", target: 1 },
];

const SWEET = /קינוח|עוג|מתוק|פודינג|טארט|מאפינס/;
const SAVORY = /מלוח|פשטיד|לחמ|בצק|פיצ/;

/**
 * Which course a dish fills: by its kind, else by its category's name.
 * Sweet pastries are dessert, savory ones a first course; sides, spreads
 * and drinks fill none.
 */
export function courseOf(dish: {
  dishRole: DishRole | null;
  category: string | null;
}): Course | null {
  const category = dish.category ?? "";
  switch (dish.dishRole) {
    case "soup":
      return "first";
    case "main":
      return "main";
    case "salad":
      return "salad";
    case "dessert":
      return "dessert";
    case "pastry":
      return SAVORY.test(category) && !SWEET.test(category) ? "first" : "dessert";
    case "side":
    case "spread":
    case "drink":
      return null;
  }
  if (/מרק/.test(category)) return "first";
  if (/סלט/.test(category)) return "salad";
  if (SWEET.test(category)) return "dessert";
  if (/עיקרי|בשר|עוף|דג/.test(category)) return "main";
  return null;
}

export type CourseStatus = {
  course: Course;
  have: number;
  target: number;
  /** Dishes from the book for a course still short; empty when it's full. */
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

export function courseStatus(
  meal: {
    id: string;
    items: { recipeId: string; dishRole: DishRole | null; category: string | null }[];
  },
  library: RecipeCard[],
  perCourse = 3,
): CourseStatus[] {
  const inMeal = new Set(meal.items.map((i) => i.recipeId));
  const rank = seeded(meal.id);
  return COURSES.map(({ course, target }) => {
    const have = meal.items.filter((i) => courseOf(i) === course).length;
    const suggestions =
      have >= target
        ? []
        : library
            .filter(
              (r) =>
                !inMeal.has(r.id) &&
                courseOf({ dishRole: r.dishRole, category: r.categoryName }) === course,
            )
            .sort((a, b) => rank(a.id) - rank(b.id))
            .slice(0, perCourse);
    return { course, have, target, suggestions };
  });
}
