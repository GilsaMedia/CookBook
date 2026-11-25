import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeEntities, extractRecipePage, isoMinutes, tooLittleText } from "./recipe-page";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("extractRecipePage", () => {
  it("uses schema.org Recipe JSON-LD when the page has it (English)", () => {
    const page = extractRecipePage(
      fixture("english-jsonld.html"),
      "https://sample.example.com/recipes/lentil-soup",
    );
    expect(page.fromJsonLd).toBe(true);
    expect(page.siteName).toBe("Sample Kitchen");
    expect(page.image).toBe("https://cdn.example.com/lentil-soup.jpg");
    expect(page.text).toContain("Title: Lemony Lentil Soup");
    expect(page.text).toContain("Yield: 6");
    expect(page.text).toContain("Prep time: 15 minutes");
    expect(page.text).toContain("Cook time: 65 minutes");
    expect(page.text).toContain("- 2 cups red lentils, rinsed");
    expect(page.text).toContain("- Juice of 1 lemon & salt to taste");
    expect(page.text).toContain("1. Soup:");
    expect(page.text).toContain("Sauté the onion");
    // The page's story and navigation don't reach the AI.
    expect(page.text).not.toContain("story");
    expect(page.text).not.toContain("Login");
  });

  it("falls back to the page's main text (Hebrew, no JSON-LD)", () => {
    const page = extractRecipePage(
      fixture("hebrew-no-jsonld.html"),
      "https://blog.example.co.il/babka",
    );
    expect(page.fromJsonLd).toBe(false);
    expect(page.siteName).toBe("blog.example.co.il");
    expect(page.image).toBe("https://blog.example.co.il/img/babka.jpg");
    expect(page.text).toContain("עוגת שמרים של סבתא");
    expect(page.text).toContain("500 גרם קמח");
    expect(page.text).toContain("אופים 35 דקות ב־180 מעלות.");
    expect(page.text).not.toContain("tracker");
    expect(page.text).not.toContain("כל הזכויות שמורות");
    expect(tooLittleText(page)).toBe(false);
  });

  it("finds no recipe data on a news page", () => {
    const page = extractRecipePage(fixture("not-a-recipe.html"), "https://news.example.com/q3");
    expect(page.fromJsonLd).toBe(false);
    expect(page.text).toContain("Quarterly results");
    expect(page.image).toBeNull();
  });

  it("treats an empty JavaScript shell as too little to import", () => {
    const page = extractRecipePage(
      "<html><head><title>App</title></head><body><div id=root></div></body></html>",
      "https://spa.example.com/r/1",
    );
    expect(tooLittleText(page)).toBe(true);
  });
});

describe("helpers", () => {
  it("reads ISO 8601 durations as minutes", () => {
    expect(isoMinutes("PT45M")).toBe(45);
    expect(isoMinutes("PT1H30M")).toBe(90);
    expect(isoMinutes("P1DT2H")).toBe(1560);
    expect(isoMinutes("PT0S")).toBeNull();
    expect(isoMinutes("soon")).toBeNull();
  });

  it("decodes named and numeric entities", () => {
    expect(decodeEntities("a &amp; b &#1488; &#x5D1; &frac12; &bogus;")).toBe(
      "a & b א ב ½ &bogus;",
    );
  });
});
