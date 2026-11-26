"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RecipeImage } from "@/components/recipe/RecipeImage";
import { he } from "@/i18n/he";
import { bookPeople, listMeals, type MealSummary } from "@/lib/data/meals";
import { fullDate, mealLabel, toIsoDate } from "@/lib/meals/format";
import type { RecipeCard } from "@/lib/recipes/types";

/**
 * The library's home sections, above the chips while nothing is searched:
 * the family's meals (the tray and what's coming up) and the newest recipes.
 */
export function HomeSections({ bookId, recipes }: { bookId: string; recipes: RecipeCard[] }) {
  return (
    <div className="flex flex-col gap-8 pt-2">
      <FamilyMeals bookId={bookId} />
      <RecentlyAdded recipes={recipes} />
    </div>
  );
}

function FamilyMeals({ bookId }: { bookId: string }) {
  const [meals, setMeals] = useState<MealSummary[]>([]);
  const [people, setPeople] = useState(new Map<string, string>());

  useEffect(() => {
    let live = true;
    Promise.all([listMeals(bookId), bookPeople(bookId)]).then(
      ([m, p]) => {
        if (!live) return;
        const today = toIsoDate(new Date());
        // The tray, then upcoming meals soonest first, then the latest past one.
        const upcoming = m
          .filter((x) => x.status !== "draft" && x.date && x.date >= today)
          .sort((a, b) => (a.date! < b.date! ? -1 : 1));
        const past = m.filter((x) => x.status !== "draft" && !(x.date && x.date >= today));
        setMeals([...m.filter((x) => x.status === "draft"), ...upcoming, ...past].slice(0, 4));
        setPeople(p);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [bookId]);

  if (meals.length === 0) return null;
  return (
    <section aria-labelledby="family-meals" className="flex flex-col gap-3">
      <h2 id="family-meals" className="text-2xl font-bold">
        {he.library.familyMeals}
      </h2>
      <p className="text-sm text-muted">{he.library.familyMealsIntro}</p>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {meals.map((m) => (
          <li key={m.id}>
            <Link
              href={`/meals?id=${m.id}`}
              className="press flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3"
            >
              <span className="font-semibold">
                <span aria-hidden="true">🍽️ </span>
                {m.status === "draft" ? he.meals.trayTitle : mealLabel(m.title, m.date)}
              </span>
              <span className="text-sm text-muted">
                {he.library.mealMeta(
                  m.date ? fullDate(m.date) : "",
                  he.meals.dishes(m.dishes),
                  m.createdBy ? (people.get(m.createdBy) ?? null) : null,
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/meals" className="press h-11 w-fit text-sm font-semibold text-accent">
        {he.library.allMeals}
      </Link>
    </section>
  );
}

function RecentlyAdded({ recipes }: { recipes: RecipeCard[] }) {
  const recent = useMemo(
    () =>
      recipes
        .filter((r) => r.createdAt)
        .sort((a, b) => (a.createdAt! < b.createdAt! ? 1 : -1))
        .slice(0, 8),
    [recipes],
  );
  if (recent.length < 2) return null;
  return (
    <section aria-labelledby="recent" className="flex flex-col gap-3">
      <h2 id="recent" className="text-2xl font-bold">
        {he.library.recent}
      </h2>
      <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1">
        {recent.map((r) => (
          <li key={r.id} className="w-40 shrink-0">
            <Link
              href={`/recipe?id=${r.id}`}
              className="press flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rule"
            >
              <RecipeImage id={r.id} url={r.imageUrl} className="aspect-[4/3] w-full" />
              <div className="flex flex-col gap-1 p-3">
                <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{r.title}</h3>
                <p className="text-xs text-muted">{he.library.addedOn(fullDate(r.createdAt!))}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
