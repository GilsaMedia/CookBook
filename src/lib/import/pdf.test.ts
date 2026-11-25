import { describe, expect, it } from "vitest";
import { linesFromItems, type PdfItem } from "./pdf";

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
