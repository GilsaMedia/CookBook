"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTray } from "@/components/meals/TrayProvider";
import { he } from "@/i18n/he";
import {
  finishList,
  setChecked,
  setInPantry,
  syncList,
  type MealList,
  type StoredItem,
} from "@/lib/data/shopping";
import { isDemo } from "@/lib/demo";
import { mealLabel } from "@/lib/meals/format";
import { SECTION_ORDER } from "@/lib/shopping";

const UNDO_MS = 5000;

/**
 * The shopping list (screen 5): by store section; the whole row checks an
 * item off, and a checked item is struck through and slides to the bottom
 * of its section; unchecking offers "בטל" for 5 seconds. What's already at
 * home waits, collapsed, at the bottom. Share, print, done.
 */
export function ShoppingScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const tray = useTray();
  const reduce = useReducedMotion();
  const mealId = params.get("meal") ?? tray.id;
  const [data, setData] = useState<MealList | null | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [undo, setUndo] = useState<StoredItem | null>(null);
  const [note, setNote] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isDemo || !mealId) return;
    let live = true;
    syncList(mealId, tray.canPlan).then(
      (d) => live && setData(d),
      () => live && setData(null),
    );
    return () => {
      live = false;
    };
  }, [mealId, tray.canPlan]);

  if (isDemo) return <p className="text-muted">{he.importer.demo}</p>;
  if (!mealId)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">{he.nav.shopping}</h1>
        <p className="text-muted">{he.shopping.noMeal}</p>
        <Link href="/meals" className="font-semibold text-accent">
          {he.shopping.toMeals}
        </Link>
      </div>
    );
  if (data === undefined)
    return <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  if (data === null) return <p className="text-muted">{he.meals.notFound}</p>;

  const { meal, list } = data;
  const editable = tray.canPlan && !!list.id;
  const update = (id: string, change: Partial<StoredItem>) =>
    setData({
      ...data,
      list: { ...list, items: list.items.map((i) => (i.id === id ? { ...i, ...change } : i)) },
    });

  async function toggle(item: StoredItem) {
    if (!editable) return;
    const checked = !item.checked;
    update(item.id, { checked });
    if (!checked) {
      setUndo(item);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), UNDO_MS);
    }
    try {
      await setChecked(item.id, checked);
    } catch {
      update(item.id, { checked: item.checked });
      setError(he.shopping.failed);
    }
  }

  async function backOnList(item: StoredItem) {
    if (!editable) return;
    update(item.id, { inPantry: false });
    try {
      await setInPantry(item.id, false);
    } catch {
      update(item.id, { inPantry: true });
      setError(he.shopping.failed);
    }
  }

  const toBuy = list.items.filter((i) => !i.inPantry);
  const atHome = list.items.filter((i) => i.inPantry);
  const sections = SECTION_ORDER.map((section) => ({
    section,
    // Unchecked first; checked ones sink to the bottom of their section.
    items: toBuy
      .filter((i) => i.section === section)
      .sort((a, b) => Number(a.checked) - Number(b.checked)),
  })).filter((s) => s.items.length > 0);
  const label = mealLabel(meal.title, meal.date) || he.meals.trayTitle;
  const line = (i: StoredItem) =>
    [i.name, i.buy !== null && i.unit ? he.shopping.amount(i.buy, i.unit) : ""]
      .filter(Boolean)
      .join(" · ");

  async function share() {
    const text = [
      he.shopping.title(label),
      ...sections.flatMap((s) => [
        "",
        he.shopping.sections[s.section],
        ...s.items.filter((i) => !i.checked).map((i) => `• ${line(i)}`),
      ]),
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: he.shopping.title(label), text });
      else {
        await navigator.clipboard.writeText(text);
        setNote(he.shopping.copied);
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  async function done() {
    if (list.id) await finishList(list.id).catch(() => {});
    router.push(`/meals?id=${meal.id}`);
  }

  const button =
    "press inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-rule bg-white px-4 text-base shadow-sm";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-semibold text-accent">
          {he.shopping.title(label)}
        </h1>
        {list.doneAt && <p className="text-sm text-muted">{he.shopping.finished}</p>}
        <Link
          href={`/meals?id=${meal.id}`}
          className="press flex h-11 w-fit items-center text-sm font-medium text-muted print:hidden"
        >
          {he.shopping.toMeal}
        </Link>
      </header>

      {sections.length === 0 && <p className="text-muted">{he.shopping.empty}</p>}
      {sections.map((s) => (
        <section
          key={s.section}
          aria-labelledby={`sec-${s.section}`}
          className="flex flex-col gap-1"
        >
          <h2 id={`sec-${s.section}`} className="text-lg font-bold">
            {he.shopping.sections[s.section]}
          </h2>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {s.items.map((i) => (
              <motion.li
                key={i.id}
                layout={reduce ? false : "position"}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={i.checked}
                  disabled={!editable}
                  onClick={() => toggle(i)}
                  className="press flex min-h-12 w-full items-center gap-3 py-2 text-start"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
                      i.checked ? "border-accent bg-accent text-white" : "border-rule"
                    }`}
                  >
                    {i.checked && "✓"}
                  </span>
                  <span
                    className={`flex flex-1 flex-wrap gap-x-2 ${i.checked ? "text-muted line-through" : ""}`}
                  >
                    <span>{line(i)}</span>
                    {i.sources.length > 1 && (
                      <span className="text-sm text-muted">{he.shopping.sources(i.sources)}</span>
                    )}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      ))}

      {atHome.length > 0 && (
        <details className="rounded-2xl bg-white p-4 ring-1 ring-rule">
          <summary className="press min-h-11 cursor-pointer font-semibold">
            {he.shopping.atHome(atHome.length)}
          </summary>
          <p className="pt-2 text-sm text-muted">{he.shopping.atHomeHint}</p>
          <ul className="flex flex-col divide-y divide-rule pt-2">
            {atHome.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => backOnList(i)}
                  className="press flex min-h-11 w-full items-center py-2 text-start text-muted"
                >
                  {line(i)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="text-sm font-medium text-green-800">
          {note}
        </p>
      )}

      <div className="flex gap-3 print:hidden">
        <button type="button" onClick={share} className={button}>
          {he.shopping.share}
        </button>
        <button type="button" onClick={() => window.print()} className={button}>
          {he.shopping.print}
        </button>
        <button
          type="button"
          onClick={done}
          className={`${button} border-accent font-semibold text-accent`}
        >
          {he.shopping.done}
        </button>
      </div>

      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-2 text-paper shadow-lg"
        >
          <span className="text-sm">{he.shopping.backOn(undo.name)}</span>
          <button
            type="button"
            onClick={() => {
              const item = undo;
              setUndo(null);
              toggle({ ...item, checked: false });
            }}
            className="press h-11 px-2 font-bold text-accent"
          >
            {he.shopping.undo}
          </button>
        </div>
      )}
    </div>
  );
}
