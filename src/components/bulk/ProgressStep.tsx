"use client";

import { useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { cancelImport, getJob, type ImportJob } from "@/lib/data/imports";

/**
 * Step 3: "47/191". The work runs on the server; this only watches. A
 * "find photos" job has nothing to review: it ends as imported.
 */
export function ProgressStep({
  job: initial,
  onReady,
  onCancelled,
}: {
  job: ImportJob;
  onReady: (job: ImportJob) => void;
  onCancelled: () => void;
}) {
  const [job, setJob] = useState(initial);

  useEffect(() => {
    if (job.status === "ready" || job.status === "imported") {
      // Not `return onReady(job)`: an effect may only return a cleanup function.
      onReady(job);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setJob(await getJob(job.id));
      } catch {
        setJob({ ...job }); // try again on the next tick
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [job, onReady]);

  const finished = job.done + job.failed;
  const percent = job.total ? Math.round((finished / job.total) * 100) : 0;
  const photos = job.format === "photos";

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">
        {photos ? he.bulk.photosProgressTitle : he.bulk.progressTitle}
      </h2>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={job.total}
        aria-valuenow={finished}
        aria-valuetext={he.bulk.progress(finished, job.total)}
        className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-rule"
      >
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-3xl font-bold tabular-nums" dir="ltr">
        {he.bulk.progress(finished, job.total)}
      </p>
      {job.failed > 0 && !photos && (
        <p className="text-sm text-muted">{he.bulk.failedSoFar(job.failed)}</p>
      )}
      <p className="text-sm text-muted">
        {photos ? he.bulk.photosProgressNote : he.bulk.progressNote}
      </p>
      <button
        type="button"
        onClick={async () => {
          await cancelImport(job.id);
          onCancelled();
        }}
        className="press h-11 self-start text-sm font-semibold text-red-700"
      >
        {he.bulk.cancel}
      </button>
    </div>
  );
}
