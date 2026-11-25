import { describe, expect, it } from "vitest";
import { assembleLibrary } from "@/lib/data/assemble";
import { sampleRows } from "@/lib/data/sample";
import { findDuplicates, textSimilarity } from "./duplicates";

const library = assembleLibrary({ bookName: "x", ...sampleRows() }).recipes;
const titles = (draft: Parameters<typeof findDuplicates>[0]) =>
  findDuplicates(draft, library).map((r) => r.title);

describe("findDuplicates", () => {
  it("matches the same source link", () => {
    expect(
      titles({
        title: "Lentil soup",
        ingredientNames: [],
        sourceUrl: "https://example.com/recipes/red-lentil-soup/",
      }),
    ).toEqual(["מרק עדשים כתומות"]);
  });

  it("matches a near-identical title", () => {
    expect(textSimilarity("מרק עדשים כתומים", "מרק עדשים כתומות")).toBeGreaterThan(0.6);
    expect(titles({ title: "מרק עדשים כתומים", ingredientNames: [], sourceUrl: null })).toEqual([
      "מרק עדשים כתומות",
    ]);
  });

  it("matches mostly the same ingredients under another name", () => {
    expect(
      titles({
        title: "ארוחת בוקר מהירה",
        ingredientNames: ["עגבנייה", "פלפל אדום", "שום", "ביצה", "פפריקה"],
        sourceUrl: null,
      }),
    ).toEqual(["שקשוקה"]);
  });

  it("doesn't flag an unrelated recipe", () => {
    expect(
      titles({
        title: "פסטה ברוטב שמנת",
        ingredientNames: ["פסטה", "שמנת", "פרמזן"],
        sourceUrl: null,
      }),
    ).toEqual([]);
  });
});
