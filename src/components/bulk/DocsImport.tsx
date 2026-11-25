"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { AiError, findRecipes } from "@/lib/ai/client";
import { docxLines, entriesFrom, htmlLines, pieces, textLines } from "@/lib/import/document";
import { readDocx } from "@/lib/import/docx";
import { splitDocument } from "@/lib/import/doc-split";
import {
  connectDrive,
  disconnectDrive,
  DOC_TYPES,
  downloadDriveFile,
  driveImportReady,
  DriveError,
  exportGoogleDoc,
  pickDocument,
} from "@/lib/import/google-drive";
import { ParseError } from "@/lib/import/parse";
import { readPdfLines } from "@/lib/import/pdf";
import type { ImportEntry, ParsedCollection } from "@/lib/import/types";

type Doc = { name: string; lines: string[]; headingEntries: ImportEntry[] };

/** A document as lines (and, for Word, the heading-based split as a fallback). */
async function readDocument(name: string, mimeType: string, bytes: Uint8Array): Promise<Doc> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    let lines: string[];
    try {
      lines = await readPdfLines(bytes);
    } catch {
      throw new ParseError("unreadable");
    }
    if (!lines.length) throw new ParseError("pdf_empty");
    return { name, lines, headingEntries: [] };
  }
  if (lower.endsWith(".docx") || mimeType === DOC_TYPES.docx) {
    const paragraphs = await readDocx(bytes).catch(() => {
      throw new ParseError("unreadable");
    });
    return { name, lines: docxLines(paragraphs), headingEntries: splitDocument(paragraphs) };
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  const lines =
    lower.endsWith(".html") || lower.endsWith(".htm") || mimeType === "text/html"
      ? htmlLines(text)
      : textLines(text);
  return { name, lines, headingEntries: [] };
}

/**
 * Step 1 of a bulk import: pick the document from Drive (or upload a
 * file), then Claude finds the recipes in it, however it's laid out. If
 * Claude can't be reached, a Word document with headings is still split by
 * its headings.
 */
export function DocsImport({
  bookId,
  onParsed,
}: {
  bookId: string;
  onParsed: (fileName: string, parsed: ParsedCollection) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function split(doc: Doc) {
    if (!doc.lines.length) throw new ParseError("no_recipes");
    const parts = pieces(doc.lines);
    setStatus(he.bulk.docsSplitting(0, parts.length));
    let entries: ImportEntry[];
    try {
      const found = await findRecipes(
        bookId,
        parts.map((p) => p.prompt),
        (done, total) => setStatus(he.bulk.docsSplitting(done, total)),
      );
      entries = entriesFrom(doc.lines, found);
    } catch (e) {
      if (!doc.headingEntries.length) throw e;
      entries = doc.headingEntries; // Claude unavailable: the headings still work
    }
    if (!entries.length) throw new ParseError("no_recipes");
    onParsed(doc.name, { format: "docx", entries });
  }

  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : "default";
    setError(
      (e instanceof AiError ? he.importer.errors[code] : undefined) ??
        he.bulk.errors[code] ??
        he.bulk.driveErrors[code] ??
        he.bulk.errors.default,
    );
    setStatus(null);
  };

  async function fromDrive() {
    setError(undefined);
    let token: string | null = null;
    try {
      token = await connectDrive();
      const file = await pickDocument(token);
      if (!file) return;
      setStatus(he.bulk.docsReading);
      const doc =
        file.mimeType === DOC_TYPES.googleDoc
          ? {
              name: file.name,
              lines: textLines(await exportGoogleDoc(token, file.id)),
              headingEntries: [],
            }
          : await readDocument(file.name, file.mimeType, await downloadDriveFile(token, file.id));
      disconnectDrive(token);
      token = null;
      await split(doc);
    } catch (e) {
      fail(
        e instanceof DriveError || e instanceof ParseError || e instanceof AiError
          ? e
          : new Error("failed"),
      );
    } finally {
      if (token) disconnectDrive(token);
    }
  }

  async function fromFile(file: File) {
    setError(undefined);
    setStatus(he.bulk.docsReading);
    try {
      await split(
        await readDocument(file.name, file.type, new Uint8Array(await file.arrayBuffer())),
      );
    } catch (e) {
      fail(e);
    }
  }

  const busy = status !== null;
  return (
    <div className="flex flex-col gap-3">
      {driveImportReady && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={fromDrive}
            className="press h-14 rounded-full bg-accent text-lg font-semibold text-white disabled:opacity-60"
          >
            {he.bulk.docsDrive}
          </button>
          <p className="text-sm text-muted">{he.bulk.docsDriveHint}</p>
        </>
      )}
      <label
        className={`press flex min-h-12 cursor-pointer items-center justify-center rounded-full px-4 py-2 text-center text-base font-semibold ${
          driveImportReady ? "bg-white ring-1 ring-rule" : "bg-accent text-white"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {driveImportReady ? he.bulk.docsUploadInstead : he.bulk.chooseDocx}
        <input
          type="file"
          accept=".docx,.pdf,.txt,.md,.html,.htm,application/pdf,text/plain,text/markdown,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])}
        />
      </label>
      <p className="text-sm text-muted">{he.bulk.docsNote}</p>
      {status && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
