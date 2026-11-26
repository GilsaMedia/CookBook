"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { getRecipe } from "@/lib/data";
import { getMeal, type Meal } from "@/lib/data/meals";
import { mealLabel } from "@/lib/meals/format";
import type { RecipeDetail } from "@/lib/recipes/types";

/** "דף ארוחה": every dish of the meal in full, on one page, for cooking them together. */
export function MealPage({ id, print = false }: { id: string; print?: boolean }) {
  const [data, setData] = useState<{ meal: Meal; recipes: (RecipeDetail | null)[] } | null>();

  useEffect(() => {
    (async () => {
      const meal = await getMeal(id);
      if (!meal) return setData(null);
      const recipes = await Promise.all(meal.items.map((i) => getRecipe(i.recipeId)));
      setData({ meal, recipes });
    })().catch(() => setData(null));
  }, [id]);

  // "הדפסה / שמירה כ-PDF": the print dialog once the dishes are in.
  useEffect(() => {
    if (print && data) window.print();
  }, [print, data]);

  if (data === undefined)
    return <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  if (data === null) return <h1 className="text-2xl font-bold">{he.meals.notFound}</h1>;
  const { meal, recipes } = data;

  return (
    <article className="flex flex-col gap-8">
      <Link
        href={`/meals?id=${meal.id}`}
        className="press -my-2 flex h-11 w-fit items-center text-sm font-medium text-muted print:hidden"
      >
        {he.meals.toMeal}
      </Link>
      <h1 className="text-3xl leading-tight font-bold">
        {meal.status === "draft" ? he.meals.trayTitle : mealLabel(meal.title, meal.date)}
      </h1>
      {meal.items.map((item, n) => {
        const recipe = recipes[n];
        if (!recipe) return null;
        return (
          <section
            key={item.id}
            aria-labelledby={`dish-${item.id}`}
            className="flex flex-col gap-4"
          >
            <header className="flex flex-col gap-1 border-b border-rule pb-2">
              <h2 id={`dish-${item.id}`} className="text-2xl font-bold">
                {recipe.title}
              </h2>
              {item.servings && (
                <p className="text-sm text-muted">{he.meals.servings(item.servings)}</p>
              )}
            </header>
            <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="flex flex-col gap-2">
                <h3 className="font-bold">{he.recipe.ingredients}</h3>
                <ul className="flex flex-col gap-1">
                  {recipe.ingredients.map((i) => (
                    <li key={i.id}>{i.displayText}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-bold">{he.recipe.steps}</h3>
                <ol className="flex list-decimal flex-col gap-2 ps-5">
                  {recipe.steps.map((s) => (
                    <li key={s.id} className="leading-relaxed">
                      {s.text}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        );
      })}
    </article>
  );
}
