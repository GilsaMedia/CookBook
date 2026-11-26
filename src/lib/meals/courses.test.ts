import { describe, expect, it } from "vitest";
import type { RecipeCard } from "@/lib/recipes/types";
import { courseGaps } from "./courses";

const card = (id: string, dishRole: RecipeCard["dishRole"]) => ({ id, dishRole }) as RecipeCard;
const library = [
  card("soup", "soup"),
  card("chicken", "main"),
  card("salad-1", "salad"),
  card("salad-2", "salad"),
  card("salad-3", "salad"),
  card("cake", "dessert"),
];

describe("courseGaps", () => {
  it("lists the courses still missing, with dishes not already in the meal", () => {
    const gaps = courseGaps(
      {
        id: "m1",
        items: [
          { recipeId: "chicken", dishRole: "main" },
          { recipeId: "salad-1", dishRole: "salad" },
        ],
      },
      library,
    );
    // Main is there; no sides in the book; one of two salads; no dessert yet.
    expect(gaps.map((g) => [g.role, g.have, g.target])).toEqual([
      ["salad", 1, 2],
      ["dessert", 0, 1],
    ]);
    expect(gaps[0].suggestions.map((r) => r.id).sort()).toEqual(["salad-2", "salad-3"]);
  });

  it("suggests the same dishes each time for the same meal", () => {
    const meal = { id: "m2", items: [] };
    const first = courseGaps(meal, library, 1).map((g) => g.suggestions[0].id);
    expect(courseGaps(meal, [...library].reverse(), 1).map((g) => g.suggestions[0].id)).toEqual(
      first,
    );
  });
});
