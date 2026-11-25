import { describe, expect, it } from "vitest";
import { noteToEntry } from "./keep-api";

describe("noteToEntry (Keep API)", () => {
  it("turns a text note into a recipe entry with its photos and date", () => {
    const entry = noteToEntry(
      {
        name: "notes/abc",
        title: "עוגת גבינה",
        createTime: "2021-05-02T10:00:00Z",
        body: { text: { text: "500 גרם גבינה\nאופים 50 דקות" } },
      },
      ["keep-api/notes/abc/attachments/1"],
    );
    expect(entry).toMatchObject({
      key: "notes/abc",
      kind: "recipe",
      text: "Title: עוגת גבינה\n500 גרם גבינה\nאופים 50 דקות",
      createdAt: "2021-05-02T10:00:00Z",
      images: ["keep-api/notes/abc/attachments/1"],
    });
  });

  it("reads checklists, including nested items", () => {
    const entry = noteToEntry(
      {
        name: "notes/list",
        title: "סלט",
        body: {
          list: {
            listItems: [
              { text: { text: "עגבנייה" }, childListItems: [{ text: { text: "חתוכה" } }] },
              { text: { text: "מלפפון" } },
            ],
          },
        },
      },
      [],
    );
    expect(entry?.text).toBe("Title: סלט\n- עגבנייה\n  - חתוכה\n- מלפפון");
  });

  it("marks link-only and empty notes, and skips trashed ones", () => {
    expect(
      noteToEntry({ name: "n/1", body: { text: { text: " https://www.example.com/x " } } }, []),
    ).toMatchObject({
      kind: "link",
      sourceUrl: "https://www.example.com/x",
      sourceName: "example.com",
    });
    expect(noteToEntry({ name: "n/2", title: "ריק" }, [])?.kind).toBe("empty");
    expect(noteToEntry({ name: "n/3", title: "x", trashed: true }, [])).toBeNull();
  });
});
