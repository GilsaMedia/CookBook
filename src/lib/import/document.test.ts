import { describe, expect, it } from "vitest";
import { docxLines, entriesFrom, pieces, textLines, type Found } from "./document";
import { readDocx } from "./docx";
import { sampleDocx } from "./fixture-docx";

describe("document lines", () => {
  it("keeps the Word structure Claude needs: headings, bullets, links", async () => {
    const lines = docxLines(await readDocx(sampleDocx()));
    expect(lines.slice(0, 6)).toEqual([
      "# ספר המתכונים של אפרת",
      "## מרקים",
      "### מרק עדשים",
      "↑ לתוכן העניינים · הוספה לארוחה בוואטסאפ", // internal #toc link left out
      "מקור המתכון (https://www.example.co.il/lentil-soup?a=1&b=2)",
      "- 2 כוסות עדשים כתומות",
    ]);
  });

  it("reads plain text and Markdown", () => {
    expect(textLines("# מרקים\r\n\nמרק\n  \n- גזר  ")).toEqual(["# מרקים", "מרק", "- גזר"]);
  });
});

describe("pieces", () => {
  const lines = Array.from({ length: 3000 }, (_, i) => `שורה ${i + 1} ${"x".repeat(50)}`);
  const ps = pieces(lines);

  it("covers every line exactly once in the cores", () => {
    expect(ps[0].coreStart).toBe(1);
    ps.slice(1).forEach((p, i) => expect(p.coreStart).toBe(ps[i].coreEnd + 1));
    expect(ps.at(-1)!.coreEnd).toBe(3000);
  });

  it("shows context after the core and numbers lines globally", () => {
    const second = ps[1].prompt.split("\n");
    expect(second[0]).toMatch(/^CORE: lines \d+–\d+/);
    expect(second[2]).toMatch(new RegExp(`^${ps[1].coreStart}\\| `));
    expect(ps[0].prompt).toContain(`${ps[0].coreEnd + 80}| `);
  });
});

describe("entriesFrom", () => {
  const lines = [
    "## מרקים", // 1
    "### מרק עדשים", // 2
    "↑ לתוכן העניינים · הוספה לארוחה בוואטסאפ", // 3
    "מקור המתכון (https://www.example.co.il/lentil)", // 4
    "- 2 כוסות עדשים", // 5
    "מבשלים 30 דקות.", // 6
    "עוף בלימון", // 7
    "https://chef.example.com/lemon-chicken", // 8
    "פולנטה", // 9
  ];
  const found: Found[] = [
    {
      title: "מרק עדשים",
      category: "מרקים",
      start: 2,
      end: 8,
      source_url: "https://www.example.co.il/lentil",
    },
    { title: "עוף בלימון", category: "מרקים", start: 7, end: 8, source_url: null },
    { title: "עוף בלימון", category: "מרקים", start: 7, end: 8, source_url: null }, // from an overlapping piece
    { title: "פולנטה", category: "מרקים", start: 9, end: 40, source_url: null },
  ];
  const entries = entriesFrom(lines, found);

  it("cuts recipes from the document's own lines, trimming overlaps and navigation", () => {
    expect(entries.map((e) => [e.title, e.kind])).toEqual([
      ["מרק עדשים", "recipe"],
      ["עוף בלימון", "link"],
      ["פולנטה", "empty"],
    ]);
    expect(entries[0].text).toBe("Title: מרק עדשים\n- 2 כוסות עדשים\nמבשלים 30 דקות.");
    expect(entries[0]).toMatchObject({
      group: "מרקים",
      sourceUrl: "https://www.example.co.il/lentil",
      sourceName: "example.co.il",
    });
  });

  it("keeps a one-line recipe written on its title line", () => {
    const [cake] = entriesFrom(
      ["עוגת שוקולד מהירה - 2 ביצים, כוס סוכר, חצי כוס קקאו. אופים 30 דק׳ ב-180."],
      [{ title: "עוגת שוקולד מהירה", category: null, start: 1, end: 1, source_url: null }],
    );
    expect(cake.kind).toBe("recipe");
    expect(cake.text).toContain("2 ביצים");
  });

  it("turns a recipe that is only a link into a link entry", () => {
    expect(entries[1].sourceUrl).toBe("https://chef.example.com/lemon-chicken");
  });
});
