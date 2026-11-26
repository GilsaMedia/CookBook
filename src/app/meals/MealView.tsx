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
import { courseStatus } from "@/lib/meals/courses";
import { defaultTitle, fullDate, mealLabel, nextFriday } from "@/lib/meals/format";
import type { RecipeCard } from "@/lib/recipes/types";
import { withBase } from "@/lib/demo";

const UNDO_MS = 5000;
const field =
  "h-12 w-full rounded-xl border border-rule bg-white px-4 text-base outline-none focus:border-accent";
const small = "press flex h-11 items-center rounded-full px-3 text-sm font-semibold";
/** The outlined pill buttons of the meal screen ("מצרכים", "הסרה", "הוספה לארוחה"). */
const pill =
  "press inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-rule px-5 text-base";
/** The outlined rectangular buttons ("יצירת רשימת קניות", "העתקת קישור"). */
const rect =
  "press inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-rule bg-white px-5 text-base shadow-sm";

/**
 * One meal (screen 4), laid out like the family's own meal page: the title
 * and who opened it, the dishes (each with its kind, who added it,
 * "מצרכים" and "הסרה", with a 5-second "בטל"), "השלמת התפריט", the
 * shopping list, and sharing. A dish's servings and "החלפה" are in its
 * "מצרכים" panel.
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
    <div className="flex flex-col gap-6">
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
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl leading-tight font-semibold text-accent">
            {isTray ? he.meals.trayHeading(mealLabel(m.title, m.date)) : mealLabel(m.title, m.date)}
          </h1>
          <p className="text-sm text-muted">
            {he.meals.openedBy(
              m.createdBy ? (people.get(m.createdBy) ?? null) : null,
              fullDate(m.createdAt),
            )}
          </p>
        </header>
      )}
      <p className="leading-relaxed text-muted">{he.meals.intro}</p>

      {m.items.length === 0 ? (
        <p className="border-t border-rule pt-4 text-muted">{he.meals.trayEmpty}</p>
      ) : (
        <ul
          aria-label={he.meals.dishesLabel}
          className="flex flex-col divide-y divide-rule border-y border-rule"
        >
          {m.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Link href={`/recipe?id=${item.recipeId}`} className="me-auto text-lg font-bold">
                  {item.title}
                </Link>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <span className="text-sm text-muted">
                    {[
                      item.dishRole ? he.dishRole[item.dishRole] : item.category,
                      item.addedBy && people.get(item.addedBy)
                        ? `👤 ${people.get(item.addedBy)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("  ")}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-label={he.meals.ingredientsOf(item.title)}
                      aria-expanded={open === item.id}
                      onClick={() => setOpen(open === item.id ? null : item.id)}
                      className={`${pill} ${open === item.id ? "bg-ink text-paper" : ""}`}
                    >
                      {he.meals.ingredients(ingredients.get(item.recipeId)?.length ?? 0)}
                    </button>
                    {canPlan && (
                      <button
                        type="button"
                        aria-label={`${he.meals.remove}: ${item.title}`}
                        onClick={() => remove(item)}
                        className={pill}
                      >
                        {he.meals.remove}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {open === item.id && (
                <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{he.meals.servingsLabel}</span>
                    {canPlan && (
                      <button
                        type="button"
                        aria-label={he.meals.less(item.title)}
                        disabled={!item.servings || item.servings <= 1}
                        onClick={() => act(() => setServings(item.id, (item.servings ?? 2) - 1))}
                        className="press flex size-11 items-center justify-center rounded-full border border-rule text-lg font-bold disabled:opacity-40"
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
                        className="press flex size-11 items-center justify-center rounded-full border border-rule text-lg font-bold"
                      >
                        +
                      </button>
                    )}
                    {canPlan && (
                      <Link
                        href={`/?pick=${item.id}&meal=${m.id}`}
                        aria-label={`${he.meals.swap}: ${item.title}`}
                        className={`${pill} ms-auto`}
                      >
                        {he.meals.swap}
                      </Link>
                    )}
                  </div>
                  <ul className="flex flex-col gap-1 border-t border-rule pt-3 text-sm">
                    {(ingredients.get(item.recipeId) ?? []).map((line, n) => (
                      <li key={n}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canPlan && (
        <Link href={`/?add=${m.id}`} className={`${pill} self-start`}>
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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled
          aria-label={`${he.meals.shopping} · ${he.common.soon}`}
          className={`${rect} text-muted`}
        >
          {he.meals.shopping}
          <SoonBadge />
        </button>
        <Link href={`/meals?id=${m.id}&view=page`} className={rect}>
          {he.meals.page}
        </Link>
      </div>

      <ShareMeal meal={m} />

      {canPlan && (
        <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
          <button type="button" onClick={() => setEditing(true)} className={`${small} text-accent`}>
            {he.meals.edit}
          </button>
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
            className={`${small} text-red-700`}
          />
        </div>
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
  const courses = courseStatus(meal, library);
  return (
    <section aria-labelledby="missing" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 id="missing" className="text-2xl font-semibold text-accent">
          {he.meals.missingTitle}
        </h2>
        <p className="leading-relaxed text-muted">{he.meals.missingIntro}</p>
      </div>
      {courses.map((g) => (
        <div key={g.course} className="flex flex-col gap-1">
          <h3 className={`text-lg font-bold ${g.have >= g.target ? "text-muted" : ""}`}>
            {he.meals.course(he.meals.courses[g.course], g.have, g.target)}
          </h3>
          {g.suggestions.length > 0 && (
            <ul className="flex flex-col divide-y divide-rule">
              {g.suggestions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="me-auto font-bold">{r.title}</span>
                  {r.categoryName && <span className="text-sm text-muted">{r.categoryName}</span>}
                  <button
                    type="button"
                    aria-label={`${he.meals.addSuggestion}: ${r.title}`}
                    onClick={() => onAdd(r)}
                    className={pill}
                  >
                    {he.meals.addSuggestion}
                  </button>
                </li>
              ))}
            </ul>
          )}
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

  const copyIcon = (
    <svg
      aria-hidden="true"
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
  return (
    <section
      aria-labelledby="share-meal"
      className="flex flex-col gap-4 border-t border-rule pt-6 print:hidden"
    >
      <h2 id="share-meal" className="text-2xl font-semibold text-accent">
        {he.meals.shareTitle}
      </h2>
      <p className="text-muted">{he.meals.shareIntro}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={() => copy("link")} className={rect}>
          {copyIcon}
          {copied === "link" ? he.meals.copied : he.meals.copyLink}
        </button>
        <button type="button" onClick={() => copy("text")} className={rect}>
          {copyIcon}
          {copied === "text" ? he.meals.copied : he.meals.copyText}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex h-11 items-center underline underline-offset-4"
        >
          {he.meals.whatsapp}
        </a>
        <Link
          href={`/meals?id=${meal.id}&view=page&print=1`}
          className="press flex h-11 items-center gap-1 font-semibold"
        >
          <span aria-hidden="true">🖨️</span> {he.meals.print}
        </Link>
      </div>
    </section>
  );
}
