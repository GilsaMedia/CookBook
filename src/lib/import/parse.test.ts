import { describe, expect, it } from "vitest";
import { parseCollection, ParseError } from "./parse";
import { makeZip } from "./zip-test-helper";

// A small document shaped like Efrat's cookbook: Title, a table of contents,
// category headings (Heading 1), recipe headings (Heading 2), a navigation
// line under every recipe, an optional "מקור המתכון" link, bullets, steps.
const para = (text: string, opts: { style?: string; list?: boolean; link?: string } = {}) => {
  const pPr =
    opts.style || opts.list
      ? `<w:pPr>${opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ""}${opts.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}</w:pPr>`
      : "";
  const run = `<w:r><w:t xml:space="preserve">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r>`;
  return `<w:p>${pPr}${opts.link ? `<w:hyperlink r:id="${opts.link}">${run}</w:hyperlink>` : run}</w:p>`;
};
const nav = para("↑ לתוכן העניינים · הוספה לארוחה בוואטסאפ", { link: "rIdToc" });

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
${para("ספר המתכונים של אפרת", { style: "Title" })}
${para("מרקים", { style: "TOC1" })}
${para("מרק עדשים", { style: "TOC2" })}
${para("מרקים", { style: "Heading1" })}
${para("מרק עדשים", { style: "Heading2" })}
${nav}
${para("מקור המתכון", { link: "rIdSrc" })}
${para("2 כוסות עדשים כתומות", { list: true })}
${para("1 בצל", { list: true })}
${para("מבשלים 30 דקות & טוחנים.")}
${para("מוסקה של קורין", { style: "Heading2" })}
${nav}
${para("3 חצילים", { list: true })}
${para("אופים בתנור על 160 מעלות שעה.")}
${para("מנות עיקריות – בשר ועוף", { style: "Heading1" })}
${para("מוסקה – קורין", { style: "Heading2" })}
${nav}
${para("3 חצילים", { list: true })}
${para("אופים בתנור על 160 מעלות שעה.")}
${para("עוף בלימון", { style: "Heading2" })}
${nav}
${para("מקור המתכון", { link: "rIdSrc2" })}
${para("פולנטה של מחניודה", { style: "Heading2" })}
${nav}
</w:body></w:document>`;

const stylesXml = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/></w:style>
</w:styles>`;

const relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdSrc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.example.co.il/lentil-soup?a=1&amp;b=2" TargetMode="External"/>
<Relationship Id="rIdSrc2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://chef.example.com/lemon-chicken" TargetMode="External"/>
<Relationship Id="rIdToc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#toc" TargetMode="External"/>
</Relationships>`;

const docx = makeZip({
  "[Content_Types].xml": "<Types/>",
  "word/document.xml": documentXml,
  "word/styles.xml": stylesXml,
  "word/_rels/document.xml.rels": relsXml,
});

describe("Word documents", () => {
  it("splits by category and recipe headings, skipping the title and table of contents", async () => {
    const { format, entries } = await parseCollection("cookbook.docx", docx);
    expect(format).toBe("docx");
    expect(entries.map((e) => [e.group, e.title, e.kind])).toEqual([
      ["מרקים", "מרק עדשים", "recipe"],
      ["מרקים", "מוסקה של קורין", "recipe"],
      ["מנות עיקריות – בשר ועוף", "מוסקה – קורין", "recipe"],
      ["מנות עיקריות – בשר ועוף", "עוף בלימון", "link"],
      ["מנות עיקריות – בשר ועוף", "פולנטה של מחניודה", "empty"],
    ]);
  });

  it("keeps bullets and steps, drops navigation lines, and takes the source link", async () => {
    const [soup] = (await parseCollection("cookbook.docx", docx)).entries;
    expect(soup.text).toBe(
      "Title: מרק עדשים\n- 2 כוסות עדשים כתומות\n- 1 בצל\nמבשלים 30 דקות & טוחנים.",
    );
    expect(soup.sourceUrl).toBe("https://www.example.co.il/lentil-soup?a=1&b=2");
    expect(soup.sourceName).toBe("example.co.il");
  });

  it("turns a recipe that is only a source link into a link entry", async () => {
    const entries = (await parseCollection("cookbook.docx", docx)).entries;
    const chicken = entries.find((e) => e.title === "עוף בלימון")!;
    expect(chicken.sourceUrl).toBe("https://chef.example.com/lemon-chicken");
    expect(chicken.text).toBe("");
  });
});

describe("Google Keep Takeout", () => {
  const note = (o: object) => JSON.stringify(o);
  const keep = makeZip({
    "Takeout/Keep/עוגת גבינה.json": note({
      title: "עוגת גבינה",
      textContent: "500 גרם גבינה\nאופים 50 דקות",
      labels: [{ name: "עוגות" }, { name: "שבועות" }],
      attachments: [{ filePath: "cake.jpg", mimetype: "image/jpeg" }],
      createdTimestampUsec: 1_600_000_000_000_000,
    }),
    "Takeout/Keep/cake.jpg": new Uint8Array([0xff, 0xd8, 0xff]),
    "Takeout/Keep/רשימה.json": note({
      title: "רשימת קניות",
      listContent: [{ text: "חלב" }, { text: "ביצים" }],
    }),
    "Takeout/Keep/קישור.json": note({ title: "", textContent: "https://www.example.com/hummus  " }),
    "Takeout/Keep/ריק.json": note({ title: "ריק" }),
    "Takeout/Keep/נמחק.json": note({ title: "ישן", textContent: "x", isTrashed: true }),
    "Takeout/Keep/Labels.txt": "עוגות",
  });

  it("makes one entry per note with labels, images and the creation date", async () => {
    const { format, entries } = await parseCollection("takeout.zip", keep);
    expect(format).toBe("keep");
    const cake = entries.find((e) => e.title === "עוגת גבינה")!;
    expect(cake).toMatchObject({
      kind: "recipe",
      group: "עוגות",
      labels: ["עוגות", "שבועות"],
      images: ["Takeout/Keep/cake.jpg"],
      createdAt: "2020-09-13T12:26:40.000Z",
    });
    expect(cake.text).toBe("Title: עוגת גבינה\n500 גרם גבינה\nאופים 50 דקות");
  });

  it("finds link-only and empty notes, and skips trashed ones", async () => {
    const entries = (await parseCollection("takeout.zip", keep)).entries;
    expect(entries.find((e) => e.kind === "link")?.sourceUrl).toBe(
      "https://www.example.com/hummus",
    );
    expect(entries.find((e) => e.title === "ריק")?.kind).toBe("empty");
    expect(entries.some((e) => e.title === "ישן")).toBe(false);
    expect(entries.find((e) => e.title === "רשימת קניות")?.text).toContain("- חלב");
  });
});

describe("other files", () => {
  it("asks for .docx instead of PDF, and rejects unknown files", async () => {
    await expect(parseCollection("book.pdf", new Uint8Array([1]))).rejects.toThrow(ParseError);
    await expect(parseCollection("x.zip", makeZip({ "a.txt": "hi" }))).rejects.toThrow(
      "unknown_zip",
    );
    await expect(parseCollection("x.docx", new TextEncoder().encode("nope"))).rejects.toThrow(
      "unreadable",
    );
  });
});
