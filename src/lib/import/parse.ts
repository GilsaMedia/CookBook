import { readDocx } from "./docx";
import { splitDocument } from "./doc-split";
import { isKeepTakeout, readKeep } from "./keep";
import type { ParsedCollection } from "./types";
import { readZip, ZipError } from "./zip";

/** Why a file can't be imported; mapped to Hebrew in he.ts. */
export class ParseError extends Error {}

/**
 * Reads an uploaded collection in the browser: a Word document (Google Docs
 * → File → Download → .docx) or a Google Takeout ZIP of Keep. Nothing is
 * sent anywhere until the owner confirms the mapping screen.
 */
export async function parseCollection(name: string, bytes: Uint8Array): Promise<ParsedCollection> {
  if (/\.pdf$/i.test(name)) throw new ParseError("pdf");
  let zip;
  try {
    zip = readZip(bytes);
  } catch (e) {
    throw new ParseError(e instanceof ZipError ? "unreadable" : "unreadable");
  }
  if (zip.some((e) => e.name === "word/document.xml")) {
    const entries = splitDocument(await readDocx(bytes));
    if (!entries.length) throw new ParseError("no_headings");
    return { format: "docx", entries };
  }
  if (isKeepTakeout(zip)) {
    const entries = await readKeep(zip);
    if (!entries.length) throw new ParseError("no_notes");
    return { format: "keep", entries };
  }
  throw new ParseError("unknown_zip");
}
