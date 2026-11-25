import { describe, expect, it } from "vitest";
import { importedRecipeSchema } from "@/lib/ai/schema";
import { asWritten, type ImportResult } from "./imports";

const failed = (over: Partial<ImportResult>): ImportResult => ({
  id: "1",
  position: 0,
  entry: {
    key: "doc-1",
    title: "עוגת שמרים",
    group: null,
    kind: "recipe",
    sourceUrl: null,
    sourceName: null,
    category: "עוגות",
  },
  status: "failed",
  error: "busy",
  input: "Title: עוגת שמרים\n- 1 ק״ג קמח\n\n  לשים בצק רך  \nאופים 40 דקות",
  recipe: null,
  source: null,
  ...over,
});

describe("asWritten", () => {
  it("keeps the document's own lines as steps, ready to save", () => {
    const r = asWritten(failed({}));
    expect(r.status).toBe("done");
    expect(r.recipe!.title).toBe("עוגת שמרים");
    expect(r.recipe!.steps).toEqual(["- 1 ק״ג קמח", "לשים בצק רך", "אופים 40 דקות"]);
    expect(r.entry.category).toBe("עוגות");
    expect(importedRecipeSchema.safeParse(r.recipe).success).toBe(true);
  });

  it("saves a link it couldn't import as a link, with no made-up text", () => {
    const r = asWritten(
      failed({
        entry: { ...failed({}).entry, kind: "link", sourceUrl: "https://example.com/cake" },
        input: "https://example.com/cake",
      }),
    );
    expect(r.recipe!.steps).toEqual([]);
    expect(r.entry.sourceUrl).toBe("https://example.com/cake");
  });
});
