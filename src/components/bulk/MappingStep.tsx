"use client";

import { useMemo, useState } from "react";
import { he } from "@/i18n/he";
import type { CurrentBook } from "@/lib/data/book";
import type { ImportEntry, ParsedCollection } from "@/lib/import/types";

const NONE = "";
const field =
  "block h-11 w-full rounded-xl border border-rule bg-white px-3 text-sm text-ink outline-none focus:border-accent";

/**
 * Step 2 (PRD §7.3): every heading or label with its recipe count and the
 * category it goes to: an existing one with the same name, else a new one
 * named after it. Empty entries are listed for deletion.
 */
export function MappingStep({
  book,
  parsed,
  busy,
  error,
  onStart,
  onCancel,
}: {
  book: CurrentBook;
  parsed: ParsedCollection;
  busy: boolean;
  error?: string;
  onStart: (
    categoryFor: (e: ImportEntry) => string | null,
    keep: (e: ImportEntry) => boolean,
  ) => void;
  onCancel: () => void;
}) {
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of parsed.entries) {
      if (e.kind === "empty") continue;
      counts.set(e.group ?? NONE, (counts.get(e.group ?? NONE) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [parsed]);

  const existing = new Set(book.categories.map((c) => c.name));
  const [target, setTarget] = useState(
    () => new Map(groups.map(([g]) => [g, g === NONE ? NONE : g])),
  );
  const empties = parsed.entries.filter((e) => e.kind === "empty");
  const [keepEmpty, setKeepEmpty] = useState(new Set<string>());

  const recipes = parsed.entries.filter((e) => e.kind === "recipe").length;
  const links = parsed.entries.filter((e) => e.kind === "link").length;
  const total = recipes + links + keepEmpty.size;
  const options = [
    ...new Set([...book.categories.map((c) => c.name), ...groups.map(([g]) => g).filter(Boolean)]),
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="font-medium">{he.bulk.found(recipes, links, empties.length)}</p>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule">
        <h2 className="text-lg font-bold">{he.bulk.mapTitle}</h2>
        <p className="text-sm text-muted">{he.bulk.mapIntro}</p>
        <ul className="flex flex-col gap-3">
          {groups.map(([group, count]) => (
            <li key={group} className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {group || he.bulk.noGroup} <span className="text-muted">· {count}</span>
              </span>
              <select
                aria-label={group || he.bulk.noGroup}
                value={target.get(group) ?? NONE}
                onChange={(e) => setTarget(new Map(target).set(group, e.target.value))}
                className={field}
              >
                <option value={NONE}>{he.bulk.noCategory}</option>
                {options.map((name) => (
                  <option key={name} value={name}>
                    {existing.has(name) ? name : he.bulk.newCategory(name)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>

      {empties.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule">
          <h2 className="text-lg font-bold">{he.bulk.emptyTitle}</h2>
          <ul className="flex flex-col gap-1">
            {empties.map((e) => (
              <li key={e.key}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-accent"
                    checked={keepEmpty.has(e.key)}
                    onChange={(ev) => {
                      const next = new Set(keepEmpty);
                      if (ev.target.checked) next.add(e.key);
                      else next.delete(e.key);
                      setKeepEmpty(next);
                    }}
                  />
                  <span className="flex-1">{e.title}</span>
                  <span className="text-xs text-muted">{he.bulk.emptyKeep}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">{he.bulk.aiCalls(recipes + links)}</p>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy || total === 0}
          onClick={() =>
            onStart(
              (e) => target.get(e.group ?? NONE) || null,
              (e) => e.kind !== "empty" || keepEmpty.has(e.key),
            )
          }
          className="press h-12 flex-1 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
        >
          {he.bulk.start(total)}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="press h-12 rounded-full bg-white px-5 font-semibold ring-1 ring-rule"
        >
          {he.bulk.again}
        </button>
      </div>
    </div>
  );
}
