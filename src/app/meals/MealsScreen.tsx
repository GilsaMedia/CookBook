"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTray } from "@/components/meals/TrayProvider";
import { he } from "@/i18n/he";
import { getCurrentBook } from "@/lib/data/book";
import { bookPeople, listMeals, openMeal, type MealSummary } from "@/lib/data/meals";
import { isDemo } from "@/lib/demo";
import { defaultTitle, fullDate, mealLabel, nextFriday, toIsoDate } from "@/lib/meals/format";
import { MealPage } from "./MealPage";
import { MealView } from "./MealView";

export function MealsScreen() {
  const params = useSearchParams();
  const id = params.get("id");
  if (id && params.get("view") === "page")
    return <MealPage key={id} id={id} print={params.get("print") === "1"} />;
  if (id) return <MealView key={id} id={id} />;
  return <MealList />;
}

/**
 * The family's meals: the active one (what's being planned now, and what
 * the shopping list is built from), the ones coming up, the ones that
 * were, and opening a new one.
 */
function MealList() {
  const router = useRouter();
  const tray = useTray();
  const [data, setData] = useState<{
    bookId: string;
    meals: MealSummary[];
    people: Map<string, string>;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    (async () => {
      const book = await getCurrentBook();
      if (!book) return setFailed(true);
      const [meals, people] = await Promise.all([listMeals(book.id), bookPeople(book.id)]);
      setData({ bookId: book.id, meals, people });
    })().catch(() => setFailed(true));
  }, []);

  let body;
  if (isDemo) body = <p className="text-muted">{he.importer.demo}</p>;
  else if (failed) body = <p className="text-muted">{he.common.loadFailed}</p>;
  else if (!data) body = <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  else {
    const today = toIsoDate(new Date());
    const active = data.meals.filter((m) => m.status === "draft");
    const saved = data.meals.filter((m) => m.status !== "draft");
    const upcoming = saved
      .filter((m) => m.date && m.date >= today)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1));
    const past = saved.filter((m) => !(m.date && m.date >= today));
    const row = (m: MealSummary) => (
      <li key={m.id}>
        <Link
          href={`/meals?id=${m.id}`}
          className="press flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3"
        >
          <span className="font-semibold">{mealLabel(m.title, m.date) || he.meals.trayTitle}</span>
          <span className="text-sm text-muted">
            {he.library.mealMeta(
              m.date ? fullDate(m.date) : "",
              he.meals.dishes(m.dishes),
              m.createdBy ? (data.people.get(m.createdBy) ?? null) : null,
            )}
          </span>
        </Link>
      </li>
    );
    const section = (title: string, hint: string | null, list: MealSummary[]) =>
      list.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">
            {title}
            {hint && <span className="font-normal text-muted"> · {hint}</span>}
          </h2>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {list.map(row)}
          </ul>
        </section>
      );
    body = (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted">{he.library.familyMealsIntro}</p>
        {data.meals.length === 0 && <p className="text-muted">{he.meals.empty}</p>}
        {section(he.meals.activeTitle, he.meals.activeHint, active)}
        {section(he.meals.upcomingTitle, null, upcoming)}
        {section(he.meals.pastTitle, null, past)}
        {tray.canPlan && (
          <OpenMeal
            hasActive={active.length > 0}
            onOpen={async (title, date) => {
              const id = await openMeal(data.bookId, title, date);
              tray.refresh();
              router.push(`/meals?id=${id}`);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{he.library.familyMeals}</h1>
      {body}
    </div>
  );
}

/** "פתיחת ארוחה": a name (optional) and a date, the coming Friday by default. */
function OpenMeal({
  hasActive,
  onOpen,
}: {
  hasActive: boolean;
  onOpen: (title: string, date: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(nextFriday());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const field =
    "h-12 w-full rounded-xl border border-rule bg-white px-4 text-base outline-none focus:border-accent";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(false);
    try {
      await onOpen(title.trim() || defaultTitle(date), date);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-rule pt-5">
      <h2 className="text-lg font-bold">{he.meals.openTitle}</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{he.meals.nameLabel}</span>
        <input
          value={title}
          maxLength={80}
          placeholder={he.meals.namePlaceholder}
          onChange={(e) => setTitle(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{he.meals.dateLabel}</span>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={field}
        />
      </label>
      {hasActive && <p className="text-sm text-muted">{he.meals.openNote}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {he.meals.failed}
        </p>
      )}
      <button
        disabled={pending}
        className="press h-12 rounded-full bg-ink font-semibold text-paper disabled:opacity-60"
      >
        {pending ? he.meals.opening : he.meals.open}
      </button>
    </form>
  );
}
