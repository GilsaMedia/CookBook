import { describe, expect, it } from "vitest";
import { readDocx } from "./docx";
import { splitDocument } from "./doc-split";
import { sampleDocx } from "./fixture-docx";

// The heading-based split is the fallback when Claude can't be reached.
const entries = async () => splitDocument(await readDocx(sampleDocx()));

describe("splitDocument (Word headings)", () => {
  it("splits by category and recipe headings, skipping the title and table of contents", async () => {
    expect((await entries()).map((e) => [e.group, e.title, e.kind])).toEqual([
      ["מרקים", "מרק עדשים", "recipe"],
      ["מרקים", "מוסקה של קורין", "recipe"],
      ["מנות עיקריות – בשר ועוף", "מוסקה – קורין", "recipe"],
      ["מנות עיקריות – בשר ועוף", "עוף בלימון", "link"],
      ["מנות עיקריות – בשר ועוף", "פולנטה של מחניודה", "empty"],
    ]);
  });

  it("keeps bullets and steps, drops navigation lines, and takes the source link", async () => {
    const [soup] = await entries();
    expect(soup.text).toBe(
      "Title: מרק עדשים\n- 2 כוסות עדשים כתומות\n- 1 בצל\nמבשלים 30 דקות & טוחנים.",
    );
    expect(soup.sourceUrl).toBe("https://www.example.co.il/lentil-soup?a=1&b=2");
    expect(soup.sourceName).toBe("example.co.il");
  });

  it("turns a recipe that is only a source link into a link entry", async () => {
    const chicken = (await entries()).find((e) => e.title === "עוף בלימון")!;
    expect(chicken.sourceUrl).toBe("https://chef.example.com/lemon-chicken");
    expect(chicken.text).toBe("");
  });
});
