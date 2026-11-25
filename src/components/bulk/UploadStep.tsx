"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import type { ImageFiles } from "@/lib/data/imports";
import { driveImportReady, TAKEOUT_KEEP } from "@/lib/import/google-drive";
import { readImages } from "@/lib/import/images";
import { parseCollection, ParseError } from "@/lib/import/parse";
import type { ParsedCollection } from "@/lib/import/types";
import { KeepFromDrive } from "./KeepFromDrive";

const tab = (active: boolean) =>
  `press h-11 flex-1 rounded-full text-sm font-semibold ${active ? "bg-ink text-paper" : "text-ink"}`;

function Steps({ steps }: { steps: readonly string[] }) {
  return (
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
  );
}

/**
 * Step 1: where the recipes are. Keep: straight from Google (Takeout into
 * the user's Drive, picked in Google's picker), or a Takeout ZIP they
 * already have. Google Docs: a .docx download. Files are read here in the
 * browser. `reselect` shows only the ZIP picker (to attach Keep photos
 * after coming back to a ZIP import).
 */
export function UploadStep({
  onParsed,
  reselect = false,
}: {
  onParsed: (fileName: string, parsed: ParsedCollection, images: ImageFiles) => void;
  reselect?: boolean;
}) {
  const [source, setSource] = useState<"keep" | "docs">("keep");
  const [showZip, setShowZip] = useState(!driveImportReady);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();

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

  const zip = reselect || source === "keep";
  const picker = (
    <label className="press flex h-12 cursor-pointer items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
      {reading ? he.bulk.reading : zip ? he.bulk.chooseZip : he.bulk.chooseDocx}
      <input
        type="file"
        accept={
          zip
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

      {source === "keep" && driveImportReady && <KeepFromDrive onParsed={onParsed} />}

      {source === "keep" && driveImportReady && !showZip && (
        <button
          type="button"
          onClick={() => setShowZip(true)}
          className="press h-11 self-start text-sm font-semibold text-muted"
        >
          {he.bulk.keepHaveZip}
        </button>
      )}

      {source === "keep" && showZip && (
        <>
          <Steps steps={he.bulk.keepSteps} />
          <p className="text-sm text-muted">{he.bulk.keepNote}</p>
          <a
            href={TAKEOUT_KEEP}
            target="_blank"
            rel="noopener noreferrer"
            className="press flex h-12 items-center justify-center rounded-full bg-white text-base font-semibold ring-1 ring-rule"
          >
            {he.bulk.openTakeout} ↗
          </a>
          {picker}
          {problem}
        </>
      )}

      {source === "docs" && (
        <>
          <Steps steps={he.bulk.docsSteps} />
          <p className="text-sm text-muted">{he.bulk.docsNote}</p>
          {picker}
          {problem}
        </>
      )}
    </div>
  );
}
