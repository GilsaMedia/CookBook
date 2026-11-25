import { describe, expect, it } from "vitest";
import { linesFromItems, pageLinks, type PdfItem } from "./pdf";

// Pieces PDF.js reported for a Hebrew PDF printed by Chrome (x, y, width, size).
const item = (
  str: string,
  dir: string,
  x: number,
  y: number,
  width: number,
  size = 12,
): PdfItem => ({
  str,
  dir,
  x,
  y,
  width,
  size,
});

const page: PdfItem[] = [
  item("ספר המתכונים של אפרת", "rtl", 364, 764, 242, 24),
  item("מרקים", "rtl", 559, 726, 47, 18),
  item("https://www.example.co.il/lentil", "ltr", 377, 665, 163),
  item(" ", "ltr", 540, 665, 4),
  item("מקור המתכון:", "rtl", 543, 665, 63),
  item("(", "ltr", 417, 640, 4),
  item('מ"ל', "rtl", 421, 640, 17),
  item(" ", "ltr", 438, 640, 4),
  item("480", "ltr", 441, 640, 20),
  item(")", "ltr", 461, 640, 4),
  item(" ", "ltr", 465, 640, 4),
  item("כוסות עדשים כתומות", "rtl", 468, 640, 98),
  item(" ", "ltr", 566, 640, 4),
  item("2", "ltr", 569, 640, 7),
  item(".Blender", "ltr", 316, 601, 45),
  item(" ", "ltr", 361, 601, 4),
  item("מעלות, וטוחנים עם", "rtl", 364, 601, 88),
  item(" ", "ltr", 452, 601, 4),
  item("160", "ltr", 455, 601, 20),
  item(" ", "ltr", 475, 601, 4),
  item("דקות בתנור על", "rtl", 479, 601, 69),
  item(" ", "ltr", 548, 601, 4),
  item("30", "ltr", 552, 601, 13),
  item(" ", "ltr", 565, 601, 4),
  item("מבשלים", "rtl", 568, 601, 38),
  item("Banana bread", "ltr", 72, 560, 80),
];

describe("linesFromItems", () => {
  const lines = linesFromItems(page);

  it("puts Hebrew lines back in reading order, numbers and links included", () => {
    expect(lines).toContain("מקור המתכון: https://www.example.co.il/lentil");
    expect(lines).toContain('2 כוסות עדשים כתומות (480 מ"ל)');
    expect(lines).toContain("מבשלים 30 דקות בתנור על 160 מעלות, וטוחנים עם Blender.");
  });

  it("keeps English lines left to right", () => {
    expect(lines.at(-1)).toBe("Banana bread");
  });

  it("marks larger text as headings, top to bottom", () => {
    expect(lines.slice(0, 2)).toEqual(["# ספר המתכונים של אפרת", "## מרקים"]);
  });
});

// A PDF that prints every word as its own piece, with only a gap between
// them, and links as annotations (from the family cookbook PDF).
describe("word-by-word PDFs", () => {
  const words: PdfItem[] = [
    item("בשר", "rtl", 515.1, 781.8, 34.4, 22),
    item("מפורק", "rtl", 460.7, 781.8, 49.1, 22),
    item("·", "ltr", 541.5, 754.6, 3),
    item("↑", "ltr", 532, 754.6, 4.5),
    item("לתוכן", "rtl", 511, 754.6, 18.5),
    item("העניינים", "rtl", 479.9, 754.6, 28.6),
    item("מקור", "rtl", 533.3, 734.1, 16.2),
    item("המתכון", "rtl", 507.2, 734.1, 23.8),
  ];
  const links = pageLinks([
    { subtype: "Link", rect: [480, 752, 550, 763] }, // table of contents (inside the document)
    { subtype: "Link", url: "https://wa.me/1650?text=x", rect: [377, 752, 480, 763] },
    { subtype: "Link", url: "https://www.instagram.com/reel/abc/", rect: [507, 732, 550, 742] },
  ]);
  const lines = linesFromItems(words, links);

  it("puts the spaces back between words", () => {
    expect(lines[0]).toBe("# בשר מפורק");
    expect(lines[1]).toBe("· ↑ לתוכן העניינים");
  });

  it("writes a web link after its line, without WhatsApp or in-document links", () => {
    expect(lines[2]).toBe("מקור המתכון (https://www.instagram.com/reel/abc/)");
    expect(lines.join("\n")).not.toContain("wa.me");
  });
});
