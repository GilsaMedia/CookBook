import { withBase } from "@/lib/demo";

/**
 * PDF → lines, in the browser, with PDF.js (loaded only when a PDF is
 * picked). PDF.js gives each line as pieces (a Hebrew run, a number, a
 * link) in printed left to right order; Hebrew lines are put back into
 * reading order here, and larger text is marked as a heading so Claude can
 * see the structure. Scanned PDFs (pictures of pages) have no text to read.
 */

/** One piece of text on a page, as PDF.js reports it. */
export type PdfItem = {
  str: string;
  dir: string;
  x: number;
  y: number;
  width: number;
  size: number;
};

const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
};

/**
 * A line's pieces in reading order. A Hebrew line starts at its right edge,
 * so the line is right to left when its rightmost piece with letters is Hebrew.
 */
function lineText(items: PdfItem[]): string {
  // Numbers and punctuation have no direction; letters decide.
  const words = items.filter((i) => /[A-Za-z\u0590-\u05FF]/.test(i.str));
  const rightmost = words.reduce<PdfItem | null>((r, i) => (!r || i.x > r.x ? i : r), null);
  if (rightmost?.dir !== "rtl") {
    return [...items]
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join("");
  }
  return [...items]
    .sort((a, b) => b.x - a.x)
    .map((i) => {
      if (i.dir === "rtl") return i.str;
      // A bracket printed on its own is mirrored in right to left text.
      if (i.str.length === 1 && MIRROR[i.str]) return MIRROR[i.str];
      // ".Blender" is "Blender." printed: the sentence's final mark comes first.
      const lead = i.str.match(/^[.,:;!?]+/)?.[0];
      return lead ? i.str.slice(lead.length) + lead : i.str;
    })
    .join("");
}

/** Groups a page's pieces into lines (top to bottom) and marks large text as headings. */
export function linesFromItems(items: PdfItem[]): string[] {
  const rows: PdfItem[][] = [];
  for (const item of [...items].filter((i) => i.str).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= 2) row.push(item);
    else rows.push([item]);
  }
  const sizes = items
    .filter((i) => i.str.trim())
    .map((i) => i.size)
    .sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? 0;
  return rows
    .map((row) => {
      const text = lineText(row).replace(/\s+/g, " ").trim();
      const size = Math.max(...row.map((i) => i.size));
      const level = body && size > body * 1.6 ? 1 : body && size > body * 1.25 ? 2 : 0;
      return text && level ? `${"#".repeat(level)} ${text}` : text;
    })
    .filter(Boolean);
}

/** Every page's lines. Throws ParseError-compatible "pdf_empty" for scanned PDFs. */
export async function readPdfLines(bytes: Uint8Array): Promise<string[]> {
  // The legacy build runs on older Safari and Chrome too (the modern one needs
  // the newest browsers).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = withBase("/pdf.worker.min.mjs");
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      items.push({
        str: it.str,
        dir: it.dir,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width,
        size: Math.hypot(it.transform[2], it.transform[3]),
      });
    }
    lines.push(...linesFromItems(items));
  }
  await doc.destroy();
  return lines;
}
