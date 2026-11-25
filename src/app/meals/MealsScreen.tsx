"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { he } from "@/i18n/he";
import { getCurrentBook } from "@/lib/data/book";
import { listMeals, type MealSummary } from "@/lib/data/meals";
import { isDemo } from "@/lib/demo";
import { mealLabel } from "@/lib/meals/format";
import { MealPage } from "./MealPage";
import { MealView } from "./MealView";

export function MealsScreen() {
  const params = useSearchParams();
  const id = params.get("id");
  if (id && params.get("view") === "page") return <MealPage key={id} id={id} />;
  if (id) return <MealView key={id} id={id} />;
  return <MealList />;
}

/** The tray first, then saved meals, latest first. */
function MealList() {
  const [meals, setMeals] = useState<MealSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    getCurrentBook()
      .then((book) => (book ? listMeals(book.id) : []))
      .then(setMeals, () => setFailed(true));
  }, []);

  let body;
  if (isDemo) body = <p className="text-muted">{he.importer.demo}</p>;
  else if (failed) body = <p className="text-muted">{he.common.loadFailed}</p>;
  else if (!meals) body = <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  else if (meals.length === 0) body = <p className="text-muted">{he.meals.empty}</p>;
  else
    body = (
      <ul className="flex flex-col gap-3">
        {meals.map((m) => (
          <li key={m.id}>
            <Link
              href={`/meals?id=${m.id}`}
              className={`press flex items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-rule ${
                m.status === "draft" ? "bg-accent/10" : "bg-white"
              }`}
            >
              <span className="font-semibold">
                {m.status === "draft" ? he.meals.trayTitle : mealLabel(m.title, m.date)}
              </span>
              <span className="text-sm text-muted">{he.meals.dishes(m.dishes)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{he.meals.title}</h1>
      {body}
    </div>
  );
}
