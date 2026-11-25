import { describe, expect, it } from "vitest";
import { assembleLibrary } from "@/lib/data/assemble";
import { sampleRows } from "@/lib/data/sample";
import { groupDuplicates, itemsToSave, type BatchItem } from "./batch";

const library = assembleLibrary({ bookName: "x", ...sampleRows() }).recipes;
const item = (id: string, title: string, ingredientNames: string[] = [], size = 1): BatchItem => ({
  id,
  title,
  ingredientNames,
  sourceUrl: null,
  size,
});

// From Efrat's document (PLAN §4). The two moussakas are different
// versions of the dish (the document says so), so both are kept.
const batch = [
  item("1", "מוסקה של קורין", ["חציל", "ביצה", "בשר טחון", "בצל", "צנוברים", "שמנת חמוצה"], 8),
  item("2", "פולנטה של מחניודה", ["פולנטה", "פרמזן"], 5),
  item("3", "עוף בלימון", ["עוף", "לימון", "שום"], 6),
  item("4", "מוסקה – קורין", ["חציל", "בשר", "צנוברים", "בצל", "עגבנייה", "סוכר"], 10),
  item("5", "פולנטה של מחניודה", ["פולנטה", "פרמזן"], 5),
  item("6", "עוף בלימון", ["עוף", "לימון", "שום"], 4),
  item("7", "עוגת שמרים", ["קמח", "שמרים"], 7),
  item("8", "שקשוקה של אמא", ["עגבנייה", "פלפל אדום", "שום", "ביצה", "פפריקה"], 6),
];

describe("groupDuplicates", () => {
  const groups = groupDuplicates(batch, library);
  const titles = groups.map((g) => g.items.map((id) => batch.find((b) => b.id === id)!.title));

  it("groups the document's real duplicates, not versions with similar names", () => {
    expect(groups.some((g) => g.items.includes("1") || g.items.includes("4"))).toBe(false);
    expect(titles).toContainEqual(["פולנטה של מחניודה", "פולנטה של מחניודה"]);
    expect(titles).toContainEqual(["עוף בלימון", "עוף בלימון"]);
  });

  it("matches an import against the book, and leaves unique recipes alone", () => {
    const shakshuka = groups.find((g) => g.items.includes("8"))!;
    expect(shakshuka.library.map((r) => r.title)).toEqual(["שקשוקה"]);
    expect(groups.some((g) => g.items.includes("7"))).toBe(false);
  });
});

describe("itemsToSave", () => {
  const groups = groupDuplicates(batch, library);
  const key = (id: string) => groups.find((g) => g.items.includes(id))!.key;

  it("merge keeps the fullest import, or the book's copy", () => {
    const save = itemsToSave(batch, groups, new Map());
    expect(save.has("1") && save.has("4")).toBe(true); // two versions: both kept
    expect(save.has("3")).toBe(true); // the fuller chicken
    expect(save.has("6")).toBe(false);
    expect(save.has("8")).toBe(false); // the book already has shakshuka
    expect(save.has("7")).toBe(true);
  });

  it("keep both and skip do what they say", () => {
    const save = itemsToSave(
      batch,
      groups,
      new Map([
        [key("2"), "keepBoth"],
        [key("3"), "skip"],
      ]),
    );
    expect(save.has("2") && save.has("5")).toBe(true);
    expect(save.has("3") || save.has("6")).toBe(false);
  });
});
