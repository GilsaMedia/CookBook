"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTray } from "@/components/meals/TrayProvider";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SoonBadge } from "@/components/SoonBadge";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import {
  addItem,
  addToTray,
  bookPeople,
  deleteMeal,
  getMeal,
  mealIngredients,
  recipeServings,
  removeItem,
  restoreItem,
  setServings,
  updateMeal,
  type Meal,
  type MealItem,
} from "@/lib/data/meals";
import { courseGaps } from "@/lib/meals/courses";
import { defaultTitle, fullDate, mealLabel, nextFriday } from "@/lib/meals/format";
import type { RecipeCard } from "@/lib/recipes/types";
import { withBase } from "@/lib/demo";

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
  const [people, setPeople] = useState(new Map<string, string>());
  const [ingredients, setIngredients] = useState(new Map<string, string[]>());
  const [open, setOpen] = useState<string | null>(null);
  const [library, setLibrary] = useState<RecipeCard[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => getMeal(id).then(setMeal, () => setMeal(null));
  useEffect(() => {
    getMeal(id).then(setMeal, () => setMeal(null));
    getLibrary().then(
      (l) => setLibrary(l.recipes),
      () => {},
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const bookId = meal?.bookId;
  const recipeKey = meal?.items.map((i) => i.recipeId).join(",") ?? "";
  useEffect(() => {
    if (!bookId) return;
    bookPeople(bookId).then(setPeople, () => {});
  }, [bookId]);
  useEffect(() => {
    if (!recipeKey) return;
    mealIngredients(recipeKey.split(",")).then(setIngredients, () => {});
  }, [recipeKey]);

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

      {editing ? (
        <SaveForm
          meal={m}
          onSave={async (title, date) => {
            await act(() => updateMeal(m.id, { title, date }));
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl leading-tight font-bold">
            {isTray ? he.meals.trayHeading(mealLabel(m.title, m.date)) : mealLabel(m.title, m.date)}
          </h1>
          {isTray && (
            <p className="font-semibold text-accent">
              {he.meals.activeTitle} · {he.meals.activeHint}
            </p>
          )}
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
      <div className="-mt-2 flex flex-col gap-2">
        <p className="text-sm text-muted">
          {he.meals.openedBy(
            m.createdBy ? (people.get(m.createdBy) ?? null) : null,
            fullDate(m.createdAt),
          )}
        </p>
        <p className="text-sm text-muted">{he.meals.intro}</p>
      </div>

      {m.items.length === 0 ? (
        <p className="text-muted">{he.meals.trayEmpty}</p>
      ) : (
        <ul aria-label={he.meals.dishesLabel} className="flex flex-col gap-3">
          {m.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link href={`/recipe?id=${item.recipeId}`} className="text-lg font-semibold">
                  {item.title}
                </Link>
                <span className="text-sm text-muted">
                  {[
                    item.dishRole ? he.dishRole[item.dishRole] : item.category,
                    item.addedBy && people.get(item.addedBy)
                      ? `👤 ${people.get(item.addedBy)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
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
                    <button
                      type="button"
                      aria-expanded={open === item.id}
                      onClick={() => setOpen(open === item.id ? null : item.id)}
                      className={`${small} bg-paper ring-1 ring-rule`}
                    >
                      {open === item.id
                        ? he.meals.hideIngredients
                        : he.meals.ingredients(ingredients.get(item.recipeId)?.length ?? 0)}
                    </button>
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
              {open === item.id && (
                <ul className="flex flex-col gap-1 border-t border-rule pt-2 text-sm">
                  {(ingredients.get(item.recipeId) ?? []).map((line, n) => (
                    <li key={n}>{line}</li>
                  ))}
                </ul>
              )}
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
      {canPlan && (
        <Suggestions
          meal={m}
          library={library}
          onAdd={(recipe) =>
            act(async () =>
              isTray
                ? addToTray(recipe.id)
                : addItem(m, recipe.id, await recipeServings(recipe.id)),
            )
          }
        />
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled
          aria-label={`${he.meals.shopping} · ${he.common.soon}`}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent/40 font-semibold text-white"
        >
          {he.meals.shopping}
          <SoonBadge className="bg-white/90" />
        </button>
        <Link
          href={`/meals?id=${m.id}&view=page`}
          className="press flex h-12 flex-1 items-center justify-center rounded-full bg-white font-semibold ring-1 ring-rule"
        >
          {he.meals.page}
        </Link>
      </div>
      <ShareMeal meal={m} />
      {canPlan && (
        <ConfirmButton
          label={he.meals.delete}
          confirm={he.meals.deleteAsk}
          onConfirm={async () => {
            try {
              await deleteMeal(m.id);
              tray.refresh();
              router.push("/meals");
            } catch {
              setError(he.meals.failed);
            }
          }}
          className={`${small} self-start px-4 text-red-700`}
        />
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

/** The meal's name and date; the name follows the date until it's edited. */
function SaveForm({
  meal,
  onSave,
  onCancel,
}: {
  meal: Meal;
  onSave: (title: string, date: string) => Promise<void>;
  onCancel: () => void;
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
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule"
    >
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
      <div className="flex gap-2">
        <button
          disabled={pending}
          className="press h-12 flex-1 rounded-full bg-ink font-semibold text-paper disabled:opacity-60"
        >
          {pending ? he.meals.saving : he.meals.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="press h-12 flex-1 rounded-full bg-white font-semibold ring-1 ring-rule"
        >
          {he.meals.pickCancel}
        </button>
      </div>
    </form>
  );
}

/** "השלמת התפריט": courses the meal is short of, with dishes from the book to add. */
function Suggestions({
  meal,
  library,
  onAdd,
}: {
  meal: Meal;
  library: RecipeCard[];
  onAdd: (recipe: RecipeCard) => Promise<void>;
}) {
  const gaps = courseGaps(meal, library);
  if (gaps.length === 0) return null;
  return (
    <section aria-labelledby="missing" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="missing" className="text-xl font-bold">
          {he.meals.missingTitle}
        </h2>
        <p className="text-sm text-muted">{he.meals.missingIntro}</p>
      </div>
      {gaps.map((g) => (
        <div key={g.role} className="flex flex-col gap-1">
          <h3 className="font-bold">
            {he.meals.course(he.meals.courses[g.role], g.have, g.target)}
          </h3>
          <ul className="flex flex-col divide-y divide-rule">
            {g.suggestions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{r.title}</span>
                  {r.categoryName && <span className="text-xs text-muted">{r.categoryName}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`${he.meals.addSuggestion}: ${r.title}`}
                  onClick={() => onAdd(r)}
                  className="press h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-rule"
                >
                  {he.meals.addSuggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** "שיתוף הארוחה": the link, the dishes as text, WhatsApp, printing. */
function ShareMeal({ meal }: { meal: Meal }) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const link = new URL(withBase(`/meals?id=${meal.id}`), window.location.origin).toString();
  const label = mealLabel(meal.title, meal.date) || he.meals.trayTitle;
  const text = [
    label,
    ...meal.items.map(
      (i) => `• ${i.title}${i.servings ? ` (${he.meals.servings(i.servings)})` : ""}`,
    ),
    link,
  ].join("\n");

  async function copy(what: "link" | "text") {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  const button =
    "press flex h-11 flex-1 items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-rule";
  return (
    <section aria-labelledby="share-meal" className="flex flex-col gap-3 print:hidden">
      <h2 id="share-meal" className="text-xl font-bold">
        {he.meals.shareTitle}
      </h2>
      <p className="text-sm text-muted">{he.meals.shareIntro}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => copy("link")} className={button}>
          {copied === "link" ? he.meals.copied : he.meals.copyLink}
        </button>
        <button type="button" onClick={() => copy("text")} className={button}>
          {copied === "text" ? he.meals.copied : he.meals.copyText}
        </button>
      </div>
      <div className="flex gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          {he.meals.whatsapp}
        </a>
        <Link href={`/meals?id=${meal.id}&view=page&print=1`} className={button}>
          {he.meals.print}
        </Link>
      </div>
    </section>
  );
}
