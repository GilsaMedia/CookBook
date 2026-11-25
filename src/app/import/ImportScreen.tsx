"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BatchReviewStep } from "@/components/bulk/BatchReviewStep";
import { MappingStep } from "@/components/bulk/MappingStep";
import { ProgressStep } from "@/components/bulk/ProgressStep";
import { UploadStep } from "@/components/bulk/UploadStep";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { getCurrentBook, type CurrentBook } from "@/lib/data/book";
import {
  getOpenJob,
  ImportStartError,
  loadResults,
  startImport,
  type ImageFiles,
  type ImportJob,
  type ImportResult,
} from "@/lib/data/imports";
import { isDemo } from "@/lib/demo";
import type { ImportEntry, ParsedCollection } from "@/lib/import/types";
import type { RecipeCard } from "@/lib/recipes/types";

type Step =
  | { name: "loading" }
  | { name: "error"; text: string }
  | { name: "upload" }
  | { name: "map"; fileName: string; parsed: ParsedCollection }
  | { name: "progress"; job: ImportJob }
  | { name: "review"; job: ImportJob; results: ImportResult[] }
  | { name: "saved"; count: number };

// Keep photos stay in memory between steps (they're only uploaded after
// saving). Leaving the app loses them; the review asks for the ZIP again.
let imageCache: ImageFiles = new Map();

/** Bulk import (PRD §7.3): upload → mapping → progress → batch review → saved. */
export function ImportScreen() {
  const [book, setBook] = useState<CurrentBook | null>(null);
  const [library, setLibrary] = useState<RecipeCard[]>([]);
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string>();

  useEffect(() => {
    if (isDemo) return;
    (async () => {
      try {
        const [b, lib] = await Promise.all([getCurrentBook(), getLibrary()]);
        setBook(b);
        setLibrary(lib.recipes);
        if (!b) return setStep({ name: "error", text: he.importer.noBook });
        // Came back to an unfinished import: pick it up where it is.
        const job = await getOpenJob(b.id);
        if (!job) return setStep({ name: "upload" });
        if (job.status === "ready")
          return setStep({ name: "review", job, results: await loadResults(job.id) });
        setStep({ name: "progress", job });
      } catch {
        setStep({ name: "error", text: he.common.loadFailed });
      }
    })();
  }, []);

  const onReady = useCallback(async (job: ImportJob) => {
    setStep({ name: "review", job, results: await loadResults(job.id) });
  }, []);

  async function start(
    categoryFor: (e: ImportEntry) => string | null,
    keep: (e: ImportEntry) => boolean,
  ) {
    if (step.name !== "map" || !book) return;
    setBusy(true);
    setStartError(undefined);
    try {
      const job = await startImport(book, step.fileName, step.parsed, categoryFor, keep);
      setStep({ name: "progress", job });
    } catch (e) {
      const code = e instanceof ImportStartError ? e.message : "default";
      setStartError(he.bulk.errors[code] ?? he.bulk.errors.default);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (isDemo) body = <p className="text-muted">{he.importer.demo}</p>;
  else if (step.name === "loading")
    body = <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  else if (step.name === "error") body = <p className="text-muted">{step.text}</p>;
  else if (step.name === "upload")
    body = (
      <UploadStep
        onParsed={(fileName, parsed, images) => {
          imageCache = images;
          setStep({ name: "map", fileName, parsed });
        }}
      />
    );
  else if (step.name === "map")
    body = (
      <MappingStep
        book={book!}
        parsed={step.parsed}
        busy={busy}
        error={startError}
        onStart={start}
        onCancel={() => setStep({ name: "upload" })}
      />
    );
  else if (step.name === "progress")
    body = (
      <ProgressStep
        job={step.job}
        onReady={onReady}
        onCancelled={() => setStep({ name: "upload" })}
      />
    );
  else if (step.name === "review")
    body = (
      <>
        {step.job.format === "keep" && imageCache.size === 0 && (
          <UploadStep
            onParsed={(_name, _parsed, images) => {
              imageCache = images;
              setStep({ ...step });
            }}
          />
        )}
        <BatchReviewStep
          book={book!}
          jobId={step.job.id}
          results={step.results}
          library={library}
          images={imageCache}
          imagesNeeded={step.job.format === "keep"}
          onSaved={(count) => {
            imageCache = new Map();
            setStep({ name: "saved", count });
          }}
        />
      </>
    );
  else
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold">{he.bulk.saved(step.count)}</p>
        <Link
          href="/"
          className="press flex h-12 items-center justify-center rounded-full bg-accent font-semibold text-white"
        >
          {he.bulk.toLibrary}
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">
        {step.name === "review" ? he.bulk.reviewTitle : he.bulk.title}
      </h1>
      {body}
    </div>
  );
}
