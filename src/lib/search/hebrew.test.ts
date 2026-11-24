import { describe, expect, it } from "vitest";
import { normalizeHebrew, scoreMatch, searchItems, wordSimilarity } from "./hebrew";

describe("normalizeHebrew", () => {
  it("strips niqqud and folds final letters", () => {
    expect(normalizeHebrew("שָׁלוֹם")).toBe("שלומ");
    expect(normalizeHebrew("גזרים")).toBe("גזרימ");
    expect(normalizeHebrew("לחם, חמאה וקפה")).toBe("לחמ חמאה וקפה");
  });

  it("keeps words with geresh whole and splits on maqaf", () => {
    expect(normalizeHebrew("צ'יפס")).toBe("ציפס");
    expect(normalizeHebrew("תפוחי־אדמה")).toBe("תפוחי אדמה");
  });

  it("lower-cases Latin letters and keeps digits", () => {
    expect(normalizeHebrew("Pad Thai 2")).toBe("pad thai 2");
  });
});

describe("matching", () => {
  it("finds a singular ingredient from a plural query", () => {
    expect(wordSimilarity(normalizeHebrew("גזרים"), normalizeHebrew("גזר"))).toBeGreaterThan(0.3);
    expect(scoreMatch("גזרים", normalizeHebrew("סלט מרוקאי גזר שום"))).toBeGreaterThan(0);
  });

  it("forgives a small typo", () => {
    expect(scoreMatch("שקשקה", normalizeHebrew("שקשוקה"))).toBeGreaterThan(0);
  });

  it("matches word prefixes as you type", () => {
    expect(scoreMatch("מר", normalizeHebrew("מרק עדשים"))).toBe(1);
  });

  it("requires every query word to match", () => {
    expect(scoreMatch("מרק שוקולד", normalizeHebrew("מרק עדשים"))).toBe(0);
  });

  it("does not fuzz a single letter", () => {
    expect(scoreMatch("ק", normalizeHebrew("מרק"))).toBe(0);
  });
});

describe("searchItems", () => {
  const items = [
    { title: "עוגת שוקולד", text: normalizeHebrew("עוגת שוקולד קמח סוכר") },
    { title: "סלט גזר", text: normalizeHebrew("סלט גזר גזר שום") },
    { title: "מרק עדשים", text: normalizeHebrew("מרק עדשים עדשים בצל גזר") },
  ];

  it("returns everything for an empty query", () => {
    expect(searchItems(items, "  ", (i) => i.text)).toEqual(items);
  });

  it("filters to matching recipes, keeping book order on ties", () => {
    const titles = searchItems(items, "גזרים", (i) => i.text).map((i) => i.title);
    expect(titles).toEqual(["סלט גזר", "מרק עדשים"]);
  });
});
