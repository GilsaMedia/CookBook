"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { he } from "@/i18n/he";
import { cardMeta } from "@/lib/recipes/format";
import type { Library } from "@/lib/recipes/types";
import { searchItems } from "@/lib/search/hebrew";
import { RecipeImage } from "@/components/recipe/RecipeImage";
import { WarningChip } from "@/components/recipe/WarningChip";

/** Results follow the keyboard within this many ms (PRD §5.1 asks for ≤150). */
const SEARCH_DEBOUNCE_MS = 100;

const chipClass = (active: boolean) =>
  `press flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap ${
    active ? "bg-ink text-paper" : "bg-white text-ink ring-1 ring-rule"
  }`;

/**
 * Library (screen 1): search on top, category chips, card grid.
 * Filtering runs in the browser over the whole book, so it's instant.
 */
export function LibraryView({ library }: { library: Library }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Labels like "שותף מגיל" filter like categories.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of library.recipes)
      for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [library.recipes]);

  const results = useMemo(() => {
    const filtered = library.recipes.filter(
      (r) => (!categoryId || r.categoryId === categoryId) && (!tag || r.tags.includes(tag)),
    );
    return searchItems(filtered, debounced, (r) => r.searchText);
  }, [library.recipes, categoryId, tag, debounced]);

  if (library.recipes.length === 0) {
    return (
      <section className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-lg text-muted">{he.library.empty}</p>
        <Link
          href="/add"
          className="press flex h-12 items-center rounded-full bg-accent px-6 text-base font-semibold text-white"
        >
          {he.library.addRecipe}
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="search">
        <label className="relative block">
          <span className="sr-only">{he.library.searchLabel}</span>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={he.library.searchPlaceholder}
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 w-full rounded-2xl bg-white ps-12 pe-4 text-base shadow-sm ring-1 ring-rule outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
          />
        </label>
      </div>

      <div
        role="group"
        aria-label={he.library.categoriesLabel}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1"
      >
        <button
          type="button"
          aria-pressed={categoryId === null && tag === null}
          onClick={() => {
            setCategoryId(null);
            setTag(null);
          }}
          className={chipClass(categoryId === null && tag === null)}
        >
          {he.library.all}
          <span className="opacity-60">{library.recipes.length}</span>
        </button>
        {library.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={categoryId === c.id}
            // Tapping the active chip again clears the filter.
            onClick={() => {
              setCategoryId(categoryId === c.id ? null : c.id);
              setTag(null);
            }}
            className={chipClass(categoryId === c.id)}
          >
            {c.name}
            <span className="opacity-60">{c.count}</span>
          </button>
        ))}
        {tags.map(([t, count]) => (
          <button
            key={t}
            type="button"
            aria-pressed={tag === t}
            onClick={() => {
              setTag(tag === t ? null : t);
              setCategoryId(null);
            }}
            className={chipClass(tag === t)}
          >
            {t}
            <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <p role="status" className="py-12 text-center text-muted">
          {he.library.noResults}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {results.map((r) => (
            <li key={r.id} className="min-w-0">
              <Link
                href={`/recipe?id=${r.id}`}
                className="press flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rule"
              >
                <RecipeImage id={r.id} url={r.imageUrl} className="aspect-[4/3] w-full" />
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <h2 className="line-clamp-2 text-base leading-snug font-semibold">{r.title}</h2>
                  <p className="text-sm text-muted">{cardMeta(r.categoryName, r.totalMinutes)}</p>
                  {r.tags.map((t) => (
                    <span
                      key={t}
                      className="w-fit rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
                    >
                      {t}
                    </span>
                  ))}
                  <WarningChip names={r.warnings} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
