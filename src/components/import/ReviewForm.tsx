"use client";

/* eslint-disable @next/next/no-img-element -- a remote preview of the source photo */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { he } from "@/i18n/he";
import type { ImportResponse } from "@/lib/ai/schema";
import { importSourceImage, saveRecipe, type CurrentBook, type RecipeDraft } from "@/lib/data/book";
import { findDuplicates } from "@/lib/recipes/duplicates";
import type { RecipeCard } from "@/lib/recipes/types";

/** Below this confidence the AI wasn't sure; the cook should look (PRD §13.3). */
const SURE = 0.7;

// The AI doesn't pick a category; suggest one from the dish's role when the
// book still has the default category for it.
const CATEGORY_FOR_ROLE: Record<string, string> = {
  soup: "מרקים",
  salad: "סלטים",
  side: "תוספות",
  pastry: "מאפים ולחמים",
  dessert: "קינוחים ועוגיות",
  spread: "ממרחים ורטבים",
};

const field =
  "block w-full rounded-xl border border-rule bg-white px-3 text-base text-ink outline-none focus:border-accent";

function Section({
  title,
  unsure,
  children,
}: {
  title: string;
  unsure: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl p-4 ${
        unsure ? "bg-amber-50 ring-2 ring-amber-300" : "bg-white ring-1 ring-rule"
      }`}
    >
      <h2 className="flex items-center justify-between gap-2 text-lg font-bold">
        {title}
        {unsure && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
            {he.review.check}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

const minutes = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))) || 0);

/** Step 2 of adding a recipe: check and fix what the AI read, then save. */
export function ReviewForm({
  book,
  imported,
  library,
  onStartOver,
}: {
  book: CurrentBook;
  imported: ImportResponse;
  library: RecipeCard[];
  onStartOver: () => void;
}) {
  const router = useRouter();
  const { result, source } = imported;
  const suggested =
    book.categories.find((c) => c.name === CATEGORY_FOR_ROLE[result.dish_role ?? ""])?.id ?? "";

  const [title, setTitle] = useState(result.title);
  const [categoryId, setCategoryId] = useState(suggested);
  const [servings, setServings] = useState(result.servings?.toString() ?? "");
  const [prep, setPrep] = useState(result.prep_time?.toString() ?? "");
  const [cook, setCook] = useState(result.cook_time?.toString() ?? "");
  const [ingredients, setIngredients] = useState(result.ingredients);
  const [steps, setSteps] = useState(result.steps);
  const [usePhoto, setUsePhoto] = useState(Boolean(source?.image));
  const [acceptedDuplicate, setAcceptedDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const duplicates = useMemo(
    () =>
      findDuplicates(
        {
          title,
          ingredientNames: ingredients.map((i) => i.canonical_name ?? i.display_text),
          sourceUrl: source?.url ?? null,
        },
        library,
      ),
    [title, ingredients, source, library],
  );
  const warnDuplicate = duplicates.length > 0 && !acceptedDuplicate;

  async function save() {
    setSaving(true);
    setError(undefined);
    const draft: RecipeDraft = {
      ...result,
      title: title.trim() || result.title,
      categoryId: categoryId || null,
      servings: Number(servings) > 0 ? Number(servings) : null,
      prep_time: minutes(prep),
      cook_time: minutes(cook),
      ingredients: ingredients.filter((i) => i.display_text.trim()),
      steps: steps.map((s) => s.trim()).filter(Boolean),
      sourceName: source?.name ?? null,
      sourceUrl: source?.url ?? null,
    };
    try {
      const id = await saveRecipe(book, draft);
      if (usePhoto && source?.image) await importSourceImage(book.id, id, source.image);
      router.push(`/recipe?id=${id}`);
    } catch {
      setError(he.review.saveFailed);
      setSaving(false);
    }
  }

  const { confidence } = result;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{he.review.title}</h1>
        <p className="text-sm text-muted">
          {he.review.intro}
          {result.source_language !== "he" && ` ${he.review.translated}.`}
        </p>
      </header>

      {warnDuplicate && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl bg-amber-100 p-4 text-amber-950"
        >
          <p className="font-medium">
            {he.review.duplicate} {duplicates.map((d) => d.title).join(", ")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/recipe?id=${duplicates[0].id}`}
              className="press flex h-11 items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-amber-300"
            >
              {he.review.openExisting}
            </Link>
            <button
              type="button"
              onClick={() => setAcceptedDuplicate(true)}
              className="press h-11 rounded-full px-4 text-sm font-semibold text-amber-950 underline"
            >
              {he.review.saveAsNew}
            </button>
          </div>
        </div>
      )}

      {source?.image && (
        <label className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-rule">
          <img src={source.image} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
          <input
            type="checkbox"
            checked={usePhoto}
            onChange={(e) => setUsePhoto(e.target.checked)}
            className="size-5 accent-accent"
          />
          <span className="text-sm">{he.review.usePhoto}</span>
        </label>
      )}

      <Section title={he.review.name} unsure={confidence.title < SURE}>
        <input
          aria-label={he.review.name}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${field} h-12 text-lg font-semibold`}
        />
        <label className="flex flex-col gap-1 text-sm font-medium">
          {he.review.category}
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`${field} h-12`}
          >
            <option value="">{he.review.noCategory}</option>
            {book.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {source && (
          <p className="text-sm text-muted">
            {he.review.source}: {source.name ?? source.url}
          </p>
        )}
      </Section>

      <Section title={he.review.amounts} unsure={confidence.times < SURE}>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [he.review.servings, servings, setServings],
              [he.review.prepTime, prep, setPrep],
              [he.review.cookTime, cook, setCook],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex flex-col gap-1 text-sm font-medium">
              {label}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={value}
                onChange={(e) => set(e.target.value)}
                className={`${field} h-12`}
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title={he.recipe.ingredients} unsure={confidence.ingredients < SURE}>
        <ul className="flex flex-col gap-2">
          {ingredients.map((ing, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                aria-label={`${he.recipe.ingredients} ${i + 1}`}
                value={ing.display_text}
                onChange={(e) =>
                  setIngredients(
                    ingredients.map((x, j) =>
                      j === i ? { ...x, display_text: e.target.value } : x,
                    ),
                  )
                }
                className={`${field} h-11 flex-1`}
              />
              {ing.optional && <span className="text-xs text-muted">{he.review.optional}</span>}
              <button
                type="button"
                aria-label={he.review.remove}
                onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}
                className="press size-11 shrink-0 rounded-full text-xl text-muted"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setIngredients([
              ...ingredients,
              {
                display_text: "",
                quantity: null,
                unit: null,
                canonical_name: null,
                section: "other",
                optional: false,
              },
            ])
          }
          className="press h-11 self-start text-sm font-semibold text-accent"
        >
          + {he.review.addIngredient}
        </button>
      </Section>

      <Section title={he.recipe.steps} unsure={confidence.steps < SURE}>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="pt-3 text-sm font-bold text-accent">{i + 1}</span>
              <textarea
                aria-label={`${he.recipe.steps} ${i + 1}`}
                rows={2}
                value={step}
                onChange={(e) => setSteps(steps.map((s, j) => (j === i ? e.target.value : s)))}
                className={`${field} flex-1 py-2 leading-relaxed`}
              />
              <button
                type="button"
                aria-label={he.review.remove}
                onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                className="press size-11 shrink-0 rounded-full text-xl text-muted"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setSteps([...steps, ""])}
          className="press h-11 self-start text-sm font-semibold text-accent"
        >
          + {he.review.addStep}
        </button>
      </Section>

      {book.role !== "owner" && <p className="text-sm text-muted">{he.review.pending}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || warnDuplicate || !title.trim()}
          className="press h-12 flex-1 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
        >
          {saving ? he.review.saving : acceptedDuplicate ? he.review.saveAsNew : he.review.save}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          disabled={saving}
          className="press h-12 rounded-full bg-white px-5 text-base font-semibold ring-1 ring-rule"
        >
          {he.review.startOver}
        </button>
      </div>
    </div>
  );
}
