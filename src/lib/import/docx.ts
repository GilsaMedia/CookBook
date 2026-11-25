import { readText, readZip } from "./zip";

/** A paragraph of a Word document, as much as the importer needs. */
export type Paragraph = {
  /** Heading level (1 = top) from the paragraph's style, or null for body text. */
  level: number | null;
  /** True for the document's title style (not a category or recipe). */
  title: boolean;
  /** Table-of-contents paragraphs are skipped. */
  toc: boolean;
  list: boolean;
  text: string;
  links: { text: string; url: string }[];
};

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const unxml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, c: string) =>
    c[0] === "#"
      ? String.fromCodePoint(
          c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10),
        )
      : XML_ENTITIES[c.toLowerCase()],
  );

const attr = (xml: string, name: string) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

/** styleId → heading level / title / toc, from word/styles.xml. */
function readStyles(xml: string) {
  const styles = new Map<string, { level: number | null; title: boolean; toc: boolean }>();
  for (const [block] of xml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
    const id = attr(block, "w:styleId");
    if (!id) continue;
    const name = (block.match(/<w:name w:val="([^"]*)"/)?.[1] ?? id).toLowerCase();
    const outline = block.match(/<w:outlineLvl w:val="(\d)"/)?.[1];
    const byName = name.match(/^heading ?(\d)$/)?.[1];
    styles.set(id, {
      level: outline !== undefined ? Number(outline) + 1 : byName ? Number(byName) : null,
      title: name === "title",
      toc: /^toc/.test(name),
    });
  }
  return styles;
}

/** Reads a .docx's paragraphs: text, heading level, bullets and links. */
export async function readDocx(bytes: Uint8Array): Promise<Paragraph[]> {
  const files = new Map(readZip(bytes).map((e) => [e.name, e]));
  const doc = files.get("word/document.xml");
  if (!doc) throw new Error("not a docx");
  const styles = files.has("word/styles.xml")
    ? readStyles(await readText(files.get("word/styles.xml")!))
    : new Map();
  const rels = new Map<string, string>();
  const relsFile = files.get("word/_rels/document.xml.rels");
  if (relsFile) {
    for (const [tag] of (await readText(relsFile)).matchAll(/<Relationship\b[^>]*>/g)) {
      const id = attr(tag, "Id");
      const target = attr(tag, "Target");
      if (id && target && /hyperlink/.test(attr(tag, "Type") ?? "")) rels.set(id, unxml(target));
    }
  }

  const paragraphs: Paragraph[] = [];
  const xml = await readText(doc);
  for (const [p] of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const styleId = p.match(/<w:pStyle w:val="([^"]*)"/)?.[1];
    const style = (styleId && styles.get(styleId)) || {
      level: styleId?.match(/^Heading(\d)$/)?.[1] ? Number(styleId.slice(7)) : null,
      title: styleId === "Title",
      toc: /^TOC/i.test(styleId ?? ""),
    };
    const textOf = (fragment: string) =>
      unxml(
        fragment
          .replace(/<w:tab\/>/g, " ")
          .replace(/<w:br\/>/g, "\n")
          .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, "")
          .match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|\n| /g)
          ?.map((t) => (t.startsWith("<") ? t.replace(/<[^>]+>/g, "") : t))
          .join("") ?? "",
      );
    const links: Paragraph["links"] = [];
    for (const [h] of p.matchAll(/<w:hyperlink\b[\s\S]*?<\/w:hyperlink>/g)) {
      const url = rels.get(attr(h, "r:id") ?? "");
      if (url && /^https?:/i.test(url)) links.push({ text: textOf(h).trim(), url });
    }
    for (const [, url] of p.matchAll(/HYPERLINK\s+"(https?:[^"]+)"/g)) {
      links.push({ text: "", url: unxml(url) });
    }
    paragraphs.push({
      level: style.level,
      title: style.title,
      toc: style.toc,
      list: /<w:numPr>/.test(p),
      text: textOf(p)
        .replace(/[ \t]+/g, " ")
        .trim(),
      links,
    });
  }
  return paragraphs;
}
