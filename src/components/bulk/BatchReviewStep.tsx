"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { he } from "@/i18n/he";
import type { CurrentBook } from "@/lib/data/book";
import { markSkipped, saveBatch, type ImageFiles, type ImportResult } from "@/lib/data/imports";
import { groupDuplicates, itemsToSave, type BatchItem, type Decision } from "@/lib/import/batch";
import type { RecipeCard } from "@/lib/recipes/types";

const choice = (active: boolean) =>
  `press h-10 rounded-full px-3 text-sm font-semibold ${active ? "bg-ink text-paper" : "bg-white ring-1 ring-rule"}`;

/**
 * Step 4: the batch before saving (PRD §7.3). Likely duplicates are
 * grouped with merge / keep both / skip, entries the AI couldn't read are
 * listed, and recipes without a photo get a reminder.
 */
export function BatchReviewStep({
  book,
  jobId,
  results,
  library,
  images,
  imagesNeeded,
  onSaved,
}: {
  book: CurrentBook;
  jobId: string;
  results: ImportResult[];
  library: RecipeCard[];
  images: ImageFiles;
  imagesNeeded: boolean;
  onSaved: (count: number) => void;
}) {
  const ready = results.filter((r) => r.status === "done");
  const failed = results.filter((r) => r.status === "failed");

  const items: BatchItem[] = useMemo(
    () =>
      ready.map((r) => ({
        id: r.id,
        title: r.recipe?.title || r.entry.title,
        ingredientNames: (r.recipe?.ingredients ?? []).map(
          (i) => i.canonical_name ?? i.display_text,
        ),
        sourceUrl: r.source?.url ?? r.entry.sourceUrl,
        size: (r.recipe?.ingredients.length ?? 0) + (r.recipe?.steps.length ?? 0),
      })),
    [ready],
  );
  const groups = useMemo(() => groupDuplicates(items, library), [items, library]);
  const [decisions, setDecisions] = useState(new Map<string, Decision>());
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string>();

  const toSave = itemsToSave(items, groups, decisions);
  const title = new Map(items.map((i) => [i.id, i.title]));
  const noPhoto = ready.filter(
    (r) => toSave.has(r.id) && !r.source?.image && !(r.entry.images.length && images.size),
  ).length;

  async function save() {
    setSaving({ done: 0, total: toSave.size });
    setError(undefined);
    try {
      const chosen = ready.filter((r) => toSave.has(r.id));
      await markSkipped(ready.filter((r) => !toSave.has(r.id)).map((r) => r.id));
      const count = await saveBatch(book, jobId, chosen, images, (done, total) =>
        setSaving({ done, total }),
      );
      onSaved(count);
    } catch {
      setError(he.bulk.errors.default);
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p>{he.bulk.reviewIntro(ready.length)}</p>
      {imagesNeeded && images.size === 0 && (
        <p className="text-sm text-muted">{he.bulk.reselect}</p>
      )}

      {groups.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {he.bulk.duplicatesTitle} · {groups.length}
            </h2>
            <button
              type="button"
              onClick={() => setDecisions(new Map(groups.map((g) => [g.key, "skip"])))}
              className="press h-10 rounded-full px-3 text-sm font-semibold text-accent"
            >
              {he.bulk.skipAllDuplicates}
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const decision = decisions.get(g.key) ?? "merge";
              return (
                <li
                  key={g.key}
                  className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule"
                >
                  <ul className="flex flex-col gap-1 text-sm">
                    {g.items.map((id) => (
                      <li
                        key={id}
                        className={toSave.has(id) ? "font-semibold" : "text-muted line-through"}
                      >
                        {title.get(id)}
                      </li>
                    ))}
                    {g.library.map((r) => (
                      <li key={r.id}>
                        <Link href={`/recipe?id=${r.id}`} className="underline">
                          {r.title}
                        </Link>{" "}
                        <span className="text-xs text-muted">({he.bulk.inBook})</span>
                      </li>
                    ))}
                  </ul>
                  <div role="group" className="flex flex-wrap gap-2">
                    {(
                      [
                        ["merge", he.bulk.merge],
                        ["keepBoth", he.bulk.keepBoth],
                        ["skip", he.bulk.skip],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={decision === value}
                        onClick={() => setDecisions(new Map(decisions).set(g.key, value))}
                        className={choice(decision === value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {failed.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule">
          <h2 className="text-lg font-bold">
            {he.bulk.failedTitle} · {failed.length}
          </h2>
          <p className="text-sm text-muted">{he.bulk.failedHint}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {failed.map((r) => (
              <li key={r.id}>{r.entry.title}</li>
            ))}
          </ul>
        </section>
      )}

      {noPhoto > 0 && <p className="text-sm text-muted">{he.bulk.noPhotos(noPhoto)}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!!saving || toSave.size === 0}
        onClick={save}
        className="press h-12 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
      >
        {saving ? he.bulk.saving(saving.done, saving.total) : he.bulk.save(toSave.size)}
      </button>
    </div>
  );
}
