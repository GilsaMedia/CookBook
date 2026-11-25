"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTray } from "@/components/meals/TrayProvider";
import { he } from "@/i18n/he";
import {
  deleteMeal,
  getMeal,
  removeItem,
  restoreItem,
  setServings,
  updateMeal,
  type Meal,
  type MealItem,
} from "@/lib/data/meals";
import { defaultTitle, mealLabel, nextFriday } from "@/lib/meals/format";

const UNDO_MS = 5000;
const field =
  "h-12 w-full rounded-xl border border-rule bg-white px-4 text-base outline-none focus:border-accent";
const small = "press flex h-11 items-center rounded-full px-3 text-sm font-semibold";

/**
 * One meal (screen 4): dishes with their servings, "החלפה", "הסרה" (with a
 * 5-second "בטל", no confirm dialog), "הוספת מנה +". The tray is saved here
 * with a name and a date.
 */
export function MealView({ id }: { id: string }) {
  const router = useRouter();
  const tray = useTray();
  const [meal, setMeal] = useState<Meal | null | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState<MealItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => getMeal(id).then(setMeal, () => setMeal(null));
  useEffect(() => {
    getMeal(id).then(setMeal, () => setMeal(null));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  if (meal === undefined)
    return <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  if (meal === null)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{he.meals.notFound}</h1>
        <Link href="/meals" className="font-semibold text-accent">
          {he.meals.back}
        </Link>
      </div>
    );
  const m = meal;
  const isTray = m.status === "draft";
  const canPlan = tray.canPlan;

  async function act(fn: () => Promise<unknown>) {
    setError(undefined);
    try {
      await fn();
    } catch {
      setError(he.meals.failed);
    }
    await load();
    tray.refresh();
  }

  function remove(item: MealItem) {
    setMeal({ ...m, items: m.items.filter((i) => i.id !== item.id) });
    setRemoved(item);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRemoved(null), UNDO_MS);
    removeItem(item.id).then(
      () => tray.refresh(),
      () => {
        setError(he.meals.failed);
        load();
      },
    );
  }

  function undo() {
    if (!removed) return;
    const item = removed;
    setRemoved(null);
    if (timer.current) clearTimeout(timer.current);
    act(() => restoreItem(item));
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/meals"
        className="press -my-2 flex h-11 w-fit items-center text-sm font-medium text-muted"
      >
        {he.meals.back}
      </Link>

      {isTray || editing ? (
        <SaveForm
          meal={m}
          onSave={async (title, date) => {
            await act(() =>
              updateMeal(m.id, { title, date, ...(isTray ? { status: "done" as const } : {}) }),
            );
            setEditing(false);
          }}
          heading={isTray ? he.meals.trayTitle : undefined}
          disabled={!canPlan}
        />
      ) : (
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl leading-tight font-bold">{mealLabel(m.title, m.date)}</h1>
          {canPlan && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${small} w-fit px-0 text-accent`}
            >
              {he.meals.edit}
            </button>
          )}
        </header>
      )}

      {m.items.length === 0 ? (
        <p className="text-muted">{he.meals.trayEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {m.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule"
            >
              <Link href={`/recipe?id=${item.recipeId}`} className="text-lg font-semibold">
                {item.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {canPlan && (
                  <button
                    type="button"
                    aria-label={he.meals.less(item.title)}
                    disabled={!item.servings || item.servings <= 1}
                    onClick={() => act(() => setServings(item.id, (item.servings ?? 2) - 1))}
                    className="press flex size-11 items-center justify-center rounded-full bg-paper text-lg font-bold ring-1 ring-rule disabled:opacity-40"
                  >
                    −
                  </button>
                )}
                <span className="min-w-16 text-center text-sm tabular-nums">
                  {item.servings ? he.meals.servings(item.servings) : he.meals.noServings}
                </span>
                {canPlan && (
                  <button
                    type="button"
                    aria-label={he.meals.more(item.title)}
                    onClick={() => act(() => setServings(item.id, (item.servings ?? 0) + 1))}
                    className="press flex size-11 items-center justify-center rounded-full bg-paper text-lg font-bold ring-1 ring-rule"
                  >
                    +
                  </button>
                )}
                {canPlan && (
                  <div className="ms-auto flex gap-1">
                    <Link
                      href={`/?pick=${item.id}&meal=${m.id}`}
                      aria-label={`${he.meals.swap}: ${item.title}`}
                      className={`${small} bg-paper ring-1 ring-rule`}
                    >
                      {he.meals.swap}
                    </Link>
                    <button
                      type="button"
                      aria-label={`${he.meals.remove}: ${item.title}`}
                      onClick={() => remove(item)}
                      className={`${small} text-red-700`}
                    >
                      {he.meals.remove}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canPlan && (
        <Link
          href={`/?add=${m.id}`}
          className="press flex h-12 items-center justify-center rounded-full bg-white font-semibold ring-1 ring-rule"
        >
          {he.meals.addDish}
        </Link>
      )}
      <div className="flex gap-3">
        <Link
          href={`/shopping?meal=${m.id}`}
          className="press flex h-12 flex-1 items-center justify-center rounded-full bg-accent font-semibold text-white"
        >
          {he.meals.shopping}
        </Link>
        <Link
          href={`/meals?id=${m.id}&view=page`}
          className="press flex h-12 flex-1 items-center justify-center rounded-full bg-white font-semibold ring-1 ring-rule"
        >
          {he.meals.page}
        </Link>
      </div>
      {!isTray && canPlan && (
        <button
          type="button"
          onClick={async () => {
            try {
              await deleteMeal(m.id);
              router.push("/meals");
            } catch {
              setError(he.meals.failed);
            }
          }}
          className={`${small} self-start text-red-700`}
        >
          {he.meals.delete}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {removed && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-2 text-paper shadow-lg"
        >
          <span className="text-sm">{he.meals.removed(removed.title)}</span>
          <button type="button" onClick={undo} className="press h-11 px-2 font-bold text-accent">
            {he.meals.undo}
          </button>
        </div>
      )}
    </div>
  );
}

/** Name and date. Saving the tray makes it a meal; the title follows the date until edited. */
function SaveForm({
  meal,
  onSave,
  heading,
  disabled,
}: {
  meal: Meal;
  onSave: (title: string, date: string) => Promise<void>;
  heading?: string;
  disabled: boolean;
}) {
  const [date, setDate] = useState(meal.date ?? nextFriday());
  const [title, setTitle] = useState(meal.title);
  const [pending, setPending] = useState(false);
  const shown = title || defaultTitle(date);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    await onSave(shown.trim(), date);
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {heading && <h1 className="text-3xl leading-tight font-bold">{heading}</h1>}
      {!disabled && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-medium">{he.meals.nameLabel}</span>
              <input
                value={shown}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex w-40 flex-col gap-1">
              <span className="text-sm font-medium">{he.meals.dateLabel}</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <button
            disabled={pending}
            className="press h-12 rounded-full bg-ink font-semibold text-paper disabled:opacity-60"
          >
            {pending ? he.meals.saving : heading ? he.meals.saveTitle : he.meals.save}
          </button>
        </div>
      )}
    </form>
  );
}
