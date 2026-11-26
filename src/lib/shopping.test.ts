import { describe, expect, it } from "vitest";
import {
  buildShoppingList,
  mergeMarks,
  roundToBuy,
  type Dish,
  type IngredientLine,
} from "./shopping";

const dish = (
  recipeId: string,
  title: string,
  servings: number | null = null,
  recipeServings: number | null = null,
): Dish => ({
  recipeId,
  title,
  servings,
  recipeServings,
});
const line = (
  recipeId: string,
  canonicalName: string,
  quantity: number | null,
  unit: IngredientLine["unit"],
  section: IngredientLine["section"] = "produce",
): IngredientLine => ({
  recipeId,
  displayText: canonicalName,
  canonicalName,
  quantity,
  unit,
  section,
  optional: false,
});

const soup = dish("soup", "מרק");
const salad = dish("salad", "סלט");

describe("buildShoppingList", () => {
  it("adds up the same ingredient across dishes, and says which dishes it's for", () => {
    const list = buildShoppingList(
      [soup, salad],
      [line("soup", "גזר", 3, "unit"), line("salad", "גזר", 2, "unit")],
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "גזר",
      quantity: 5,
      buy: 5,
      unit: "unit",
      sources: ["מרק", "סלט"],
    });
  });

  it("adds spoons and millilitres (stored in ml): 2 tbsp + 30 ml oil → 60 ml", () => {
    const list = buildShoppingList(
      [soup, salad],
      [
        line("soup", "שמן קנולה", 30, "ml", "spices_oils"), // 2 tbsp, converted on import
        line("salad", "שמן קנולה", 30, "ml", "spices_oils"),
      ],
    );
    expect(list[0]).toMatchObject({ quantity: 60, unit: "ml" });
  });

  it("starts pantry staples as already at home", () => {
    const list = buildShoppingList(
      [soup],
      [line("soup", "מלח", null, null, "spices_oils"), line("soup", "גזר", 2, "unit")],
    );
    expect(list.find((i) => i.name === "מלח")).toMatchObject({ pantry: true, quantity: null });
    expect(list.find((i) => i.name === "גזר")!.pantry).toBe(false);
  });

  it("scales to the meal's servings, rounds to buy, and orders by store section", () => {
    const list = buildShoppingList(
      [dish("soup", "מרק", 6, 4), salad],
      [
        line("salad", "גבינה בולגרית", 220, "g", "dairy_eggs"),
        line("soup", "עגבנייה", 220, "g", "produce"), // ×1.5 → 330 g → 350 g
        line("salad", "פטרוזיליה", null, null, "produce"),
      ],
    );
    expect(list.map((i) => [i.name, i.quantity, i.buy])).toEqual([
      ["עגבנייה", 330, 350],
      ["פטרוזיליה", null, null],
      ["גבינה בולגרית", 220, 250],
    ]);
  });

  it("skips garnish and dishes that aren't in the meal", () => {
    const list = buildShoppingList(
      [soup],
      [{ ...line("soup", "שמיר", 1, "unit"), optional: true }, line("gone", "בצל", 1, "unit")],
    );
    expect(list).toEqual([]);
  });

  it("is quick: six recipes in well under 50 ms", () => {
    const dishes = Array.from({ length: 6 }, (_, n) => dish(`r${n}`, `מנה ${n}`, 8, 4));
    const lines = dishes.flatMap((d) =>
      Array.from({ length: 15 }, (_, k) =>
        line(d.recipeId, `מצרך ${k % 10}`, 100 + k, k % 2 ? "g" : "unit"),
      ),
    );
    const start = performance.now();
    buildShoppingList(dishes, lines);
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe("roundToBuy", () => {
  it("rounds to amounts you can buy", () => {
    expect(roundToBuy(330, "g")).toBe(350);
    expect(roundToBuy(1030, "g")).toBe(1100);
    expect(roundToBuy(12, "ml")).toBe(15);
    expect(roundToBuy(2.5, "unit")).toBe(3);
    expect(roundToBuy(5, "unit")).toBe(5);
  });
});

describe("mergeMarks", () => {
  it("swapping a dish drops only what nothing else needs, and keeps the checks", () => {
    const before = buildShoppingList(
      [soup, salad],
      [
        line("soup", "גזר", 3, "unit"),
        line("soup", "בצל", 1, "unit"),
        line("salad", "גזר", 2, "unit"),
      ],
    );
    const stored = before.map((b) => ({ key: b.key, checked: b.name === "גזר", inPantry: false }));
    // The soup is swapped for a dish with no onion.
    const after = buildShoppingList(
      [dish("stew", "תבשיל"), salad],
      [line("stew", "תפוח אדמה", 4, "unit"), line("salad", "גזר", 2, "unit")],
    );
    const { items, removed } = mergeMarks(stored, after);
    expect(removed.map((r) => r.key)).toEqual([before.find((b) => b.name === "בצל")!.key]);
    expect(items.find((i) => i.name === "גזר")).toMatchObject({ checked: true, quantity: 2 });
    expect(items.find((i) => i.name === "תפוח אדמה")).toMatchObject({ checked: false });
  });
});
