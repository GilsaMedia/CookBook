import { describe, expect, it } from "vitest";
import { scoreMatch } from "@/lib/search/hebrew";
import { assembleLibrary } from "./assemble";
import { SAMPLE_RECIPES, sampleRows } from "./sample";

describe("sample library", () => {
  const rows = sampleRows();
  const library = assembleLibrary({ bookName: "x", ...rows });

  it("has 8 Hebrew sample recipes sorted by title", () => {
    expect(library.recipes).toHaveLength(8);
    const titles = library.recipes.map((r) => r.title);
    expect(titles).toEqual([...titles].sort(new Intl.Collator("he").compare));
  });

  it("only lists categories that hold recipes, with counts", () => {
    expect(library.categories.find((c) => c.name === "מרקים")?.count).toBe(2);
    expect(library.categories.some((c) => c.name === "פסטה ואורז")).toBe(false);
    const total = library.categories.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(SAMPLE_RECIPES.length);
  });

  it("finds the carrot recipes when searching the plural", () => {
    const hits = library.recipes.filter((r) => scoreMatch("גזרים", r.searchText) > 0);
    expect(hits.map((r) => r.title).sort()).toEqual(["מרק עדשים כתומות", "סלט גזר מרוקאי"].sort());
  });

  it("warns about cardamom everywhere and parsley only in the sweet-potato soup", () => {
    const warnings = Object.fromEntries(library.recipes.map((r) => [r.title, r.warnings]));
    expect(warnings["עוגת תפוזים בחושה עם הל"]).toEqual(["הל"]);
    expect(warnings["מרק בטטה"]).toEqual(["פטרוזיליה"]);
    expect(warnings["מרק עדשים כתומות"]).toEqual([]);
  });
});
