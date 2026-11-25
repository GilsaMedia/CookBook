"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import type { ImageFiles } from "@/lib/data/imports";
import {
  connectKeep,
  disconnectKeep,
  KeepApiError,
  keepApiClientId,
  readKeepNotes,
} from "@/lib/import/keep-api";
import { parseCollection, ParseError } from "@/lib/import/parse";
import type { ParsedCollection } from "@/lib/import/types";
import { readZip } from "@/lib/import/zip";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

/** Reads the Keep attachments a collection refers to, for upload after saving. */
export async function readImages(bytes: Uint8Array, parsed: ParsedCollection): Promise<ImageFiles> {
  const wanted = new Set(parsed.entries.flatMap((e) => e.images));
  const files: ImageFiles = new Map();
  if (!wanted.size) return files;
  for (const entry of readZip(bytes)) {
    if (!wanted.has(entry.name)) continue;
    const type = IMAGE_TYPES[entry.name.split(".").pop()?.toLowerCase() ?? ""];
    if (type) files.set(entry.name, { bytes: await entry.read(), type });
  }
  return files;
}

// Google Takeout with only Keep selected.
const TAKEOUT_KEEP = "https://takeout.google.com/settings/takeout/custom/keep";

const tab = (active: boolean) =>
  `press h-11 flex-1 rounded-full text-sm font-semibold ${active ? "bg-ink text-paper" : "text-ink"}`;

/**
 * Step 1: where the recipes are. Keep has no API for personal accounts, so
 * it's a Google Takeout ZIP; Google Docs is a .docx download. Either way
 * the file is read right here in the browser. `reselect` shows only the
 * ZIP picker (to attach Keep photos after coming back).
 */
export function UploadStep({
  onParsed,
  reselect = false,
}: {
  onParsed: (fileName: string, parsed: ParsedCollection, images: ImageFiles) => void;
  reselect?: boolean;
}) {
  const [source, setSource] = useState<"keep" | "docs">("keep");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [keepProgress, setKeepProgress] = useState<number | null>(null);
  const [showTakeout, setShowTakeout] = useState(!keepApiClientId);

  /** Straight from Keep: Google consent popup, read the notes, revoke. */
  async function importFromKeep() {
    setError(undefined);
    setKeepProgress(0);
    let token: string | null = null;
    try {
      token = await connectKeep();
      const { entries, images } = await readKeepNotes(token, setKeepProgress);
      if (!entries.length) throw new ParseError("no_notes");
      onParsed("Google Keep", { format: "keep", entries }, images);
    } catch (e) {
      const code = e instanceof KeepApiError || e instanceof ParseError ? e.message : "failed";
      setError(he.bulk.keepErrors[code] ?? he.bulk.errors[code] ?? he.bulk.keepErrors.failed);
      if (code !== "popup_closed" && code !== "denied") setShowTakeout(true);
      setKeepProgress(null);
    } finally {
      if (token) void disconnectKeep(token);
    }
  }

  async function read(file: File) {
    setReading(true);
    setError(undefined);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseCollection(file.name, bytes);
      onParsed(file.name, parsed, await readImages(bytes, parsed));
    } catch (e) {
      const code = e instanceof ParseError ? e.message : "unreadable";
      setError(he.bulk.errors[code] ?? he.bulk.errors.default);
      setReading(false);
    }
  }

  const keep = reselect || source === "keep";
  const picker = (
    <label className="press flex h-12 cursor-pointer items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
      {reading ? he.bulk.reading : keep ? he.bulk.chooseZip : he.bulk.chooseDocx}
      <input
        type="file"
        accept={
          keep
            ? ".zip,application/zip"
            : ".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
        className="sr-only"
        disabled={reading}
        onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
      />
    </label>
  );
  const problem = error && (
    <p role="alert" className="text-sm font-medium text-red-700">
      {error}
    </p>
  );

  if (reselect) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule">
        <p className="text-sm">{he.bulk.reselect}</p>
        {picker}
        {problem}
      </div>
    );
  }

  const steps = source === "keep" ? he.bulk.keepSteps : he.bulk.docsSteps;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{he.bulk.intro}</p>
      <div
        role="group"
        aria-label={he.bulk.sourceLabel}
        className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-rule"
      >
        <button
          type="button"
          aria-pressed={source === "keep"}
          onClick={() => setSource("keep")}
          className={tab(source === "keep")}
        >
          {he.bulk.fromKeep}
        </button>
        <button
          type="button"
          aria-pressed={source === "docs"}
          onClick={() => setSource("docs")}
          className={tab(source === "docs")}
        >
          {he.bulk.fromDocs}
        </button>
      </div>

      {source === "keep" && keepApiClientId && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={keepProgress !== null}
            onClick={importFromKeep}
            className="press h-12 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
          >
            {keepProgress !== null ? he.bulk.keepReading(keepProgress) : he.bulk.keepConnect}
          </button>
          <p className="text-sm text-muted">{he.bulk.keepConnectHint}</p>
          {problem}
          {!showTakeout && (
            <button
              type="button"
              onClick={() => setShowTakeout(true)}
              className="press h-11 self-start text-sm font-semibold text-accent"
            >
              {he.bulk.keepOther}
            </button>
          )}
        </div>
      )}

      {(source === "docs" || showTakeout) && (
        <ol className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-base">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {(source === "docs" || showTakeout) && (
        <p className="text-sm text-muted">
          {source === "keep" ? he.bulk.keepNote : he.bulk.docsNote}
        </p>
      )}

      {source === "keep" && showTakeout && (
        <a
          href={TAKEOUT_KEEP}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex h-12 items-center justify-center rounded-full bg-white text-base font-semibold ring-1 ring-rule"
        >
          {he.bulk.openTakeout} ↗
        </a>
      )}
      {(source === "docs" || showTakeout) && picker}
      {(source === "docs" || !keepApiClientId) && problem}
    </div>
  );
}
