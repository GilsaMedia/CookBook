import { describe, expect, it } from "vitest";
import { findExcluded } from "./exclusions";
import type { Exclusion } from "./types";

const soup = { id: "soup", categoryId: "soups" };
const cake = { id: "cake", categoryId: "cakes" };

const rules: Exclusion[] = [
  { scope: "global", categoryId: null, recipeId: null, ingredients: ["הל"] },
  { scope: "recipe", categoryId: null, recipeId: "soup", ingredients: ["פטרוזיליה"] },
  { scope: "category", categoryId: "cakes", recipeId: null, ingredients: ["אגוזי מלך"] },
];

describe("findExcluded", () => {
  it("flags a global exclusion by whole word, not substring", () => {
    expect(
      findExcluded(cake, [{ canonicalName: "הל", displayText: "1 כפית הל טחון" }], rules),
    ).toEqual(["הל"]);
    expect(findExcluded(cake, [{ canonicalName: "חלב", displayText: "כוס חלב" }], rules)).toEqual(
      [],
    );
  });

  it("applies a recipe-scoped exclusion only to that recipe", () => {
    const parsley = [{ canonicalName: "פטרוזיליה", displayText: "פטרוזיליה לקישוט" }];
    expect(findExcluded(soup, parsley, rules)).toEqual(["פטרוזיליה"]);
    expect(findExcluded(cake, parsley, rules)).toEqual([]);
  });

  it("applies a category-scoped exclusion only within the category", () => {
    const walnuts = [{ canonicalName: null, displayText: "חצי כוס אגוזי מלך קצוצים" }];
    expect(findExcluded(cake, walnuts, rules)).toEqual(["אגוזי מלך"]);
    expect(findExcluded(soup, walnuts, rules)).toEqual([]);
  });
});
