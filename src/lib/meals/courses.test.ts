import { describe, expect, it } from "vitest";
import type { RecipeCard } from "@/lib/recipes/types";
import { courseOf, courseStatus, otherDishes } from "./courses";

const card = (id: string, dishRole: RecipeCard["dishRole"], categoryName: string | null = null) =>
  ({ id, dishRole, categoryName }) as RecipeCard;
const library = [
  card("soup", "soup"),
  card("chicken", "main"),
  card("salad-1", "salad"),
  card("salad-2", "salad"),
  card("salad-3", "salad"),
  card("cake", "dessert"),
];
const item = (
  recipeId: string,
  dishRole: RecipeCard["dishRole"],
  category: string | null = null,
) => ({
  recipeId,
  dishRole,
  category,
});

describe("courseOf", () => {
  it("puts every kind of dish in its course", () => {
    expect(courseOf({ dishRole: "pastry", category: "קינוחים, עוגות ועוגיות" })).toBe("dessert");
    expect(courseOf({ dishRole: "pastry", category: null })).toBe("dessert");
    expect(courseOf({ dishRole: "pastry", category: "פשטידות ומאפים מלוחים" })).toBe("first");
    expect(courseOf({ dishRole: "soup", category: null })).toBe("first");
    expect(courseOf({ dishRole: "side", category: "תוספות" })).toBeNull();
  });

  it("falls back on the category's name", () => {
    expect(courseOf({ dishRole: null, category: "מרקים" })).toBe("first");
    expect(courseOf({ dishRole: null, category: "סלטים" })).toBe("salad");
    expect(courseOf({ dishRole: null, category: "עוף" })).toBe("main");
    expect(courseOf({ dishRole: null, category: "קינוחים, עוגות ועוגיות" })).toBe("dessert");
  });
});

describe("courseStatus", () => {
  it("shows every course with how many it has, and suggestions for the short ones", () => {
    const status = courseStatus(
      {
        id: "m1",
        items: [
          item("chicken", "main"),
          item("salad-1", "salad"),
          item("hamantaschen", "pastry", "קינוחים, עוגות ועוגיות"),
        ],
      },
      library,
    );
    expect(status.map((s) => [s.course, s.have, s.target])).toEqual([
      ["first", 0, 1],
      ["main", 1, 2],
      ["salad", 1, 2],
      ["dessert", 1, 1],
    ]);
    expect(status[0].suggestions.map((r) => r.id)).toEqual(["soup"]);
    expect(status[2].suggestions.map((r) => r.id).sort()).toEqual(["salad-2", "salad-3"]);
    expect(status[3].suggestions).toEqual([]); // the pastry is the dessert
    expect(status[3].dishes.map((d) => d.recipeId)).toEqual(["hamantaschen"]);
    expect(status[1].dishes.map((d) => d.recipeId)).toEqual(["chicken"]);
    expect(
      otherDishes([item("rice", "side"), item("chicken", "main")]).map((d) => d.recipeId),
    ).toEqual(["rice"]);
  });

  it("suggests the same dishes each time for the same meal", () => {
    const meal = { id: "m2", items: [] };
    const first = courseStatus(meal, library, 1).map((g) => g.suggestions[0]?.id);
    expect(courseStatus(meal, [...library].reverse(), 1).map((g) => g.suggestions[0]?.id)).toEqual(
      first,
    );
  });
});
