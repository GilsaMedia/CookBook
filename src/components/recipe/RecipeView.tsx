import Link from "next/link";
import { RecipeImage } from "@/components/recipe/RecipeImage";
import { WarningChip } from "@/components/recipe/WarningChip";
import { he } from "@/i18n/he";
import { isDemo } from "@/lib/demo";
import { formatMinutes } from "@/lib/recipes/format";
import type { RecipeDetail } from "@/lib/recipes/types";

const chip = "inline-flex items-center rounded-full bg-white px-3 py-1 text-sm ring-1 ring-rule";
const tagChip =
  "inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent";

/** Recipe page (screen 2): the view, given a loaded recipe. */
export function RecipeView({ recipe }: { recipe: RecipeDetail }) {
  const chips = [
    recipe.categoryName,
    recipe.dishRole ? he.dishRole[recipe.dishRole] : null,
    recipe.cuisine,
    recipe.totalMinutes ? formatMinutes(recipe.totalMinutes) : null,
    recipe.servings ? he.recipe.servings(recipe.servings) : null,
  ].filter((c): c is string => Boolean(c));

  return (
    <article className="flex flex-col gap-5">
      <Link
        href="/"
        className="press -my-2 flex h-11 w-fit items-center gap-1 text-sm font-medium text-muted"
      >
        <svg
          aria-hidden="true"
          className="size-5 rtl:-scale-x-100"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        {he.recipe.back}
      </Link>

      <figure className="flex flex-col gap-1">
        <RecipeImage
          id={recipe.id}
          url={recipe.imageUrl}
          className="-mx-4 aspect-[4/3] max-h-[50vh] w-[calc(100%_+_2rem)] max-w-none md:mx-0 md:aspect-[16/9] md:w-full md:rounded-3xl"
        />
        {recipe.imageCredit && (
          <figcaption className="text-xs text-muted">
            <a
              href={recipe.imageCredit.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {he.recipe.photoCredit(recipe.imageCredit.author, recipe.imageCredit.license)}
            </a>
          </figcaption>
        )}
      </figure>

      <header className="flex flex-col gap-3">
        <h1 className="text-3xl leading-tight font-bold">{recipe.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c} className={chip}>
              {c}
            </span>
          ))}
          {recipe.tags.map((t) => (
            <span key={t} className={tagChip}>
              {t}
            </span>
          ))}
          <WarningChip names={recipe.warnings} />
        </div>
        {recipe.sourceUrl && (
          <p className="text-sm text-muted">
            {he.recipe.sourcePrefix}{" "}
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline underline-offset-4"
            >
              {recipe.sourceName ?? new URL(recipe.sourceUrl).hostname}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> {he.recipe.opensInNewTab}</span>
            </a>
          </p>
        )}
        {!recipe.sourceUrl && recipe.sourceName && (
          <p className="text-sm text-muted">
            {he.recipe.sourcePrefix} {recipe.sourceName}
          </p>
        )}
      </header>

      {!isDemo && (
        <Link
          href={`/share?recipe=${recipe.id}`}
          className="press -my-2 flex h-11 w-fit items-center text-sm font-semibold text-accent"
        >
          {he.recipe.share}
        </Link>
      )}

      {/* Wired in later prompts: meal tray (6) and cook mode (8). */}
      <div className="flex gap-3">
        <button
          type="button"
          className="press h-12 flex-1 rounded-full bg-accent px-5 text-base font-semibold text-white"
        >
          {he.recipe.addToMeal}
        </button>
        <button
          type="button"
          className="press h-12 flex-1 rounded-full bg-white px-5 text-base font-semibold ring-1 ring-rule"
        >
          {he.recipe.cookMode}
        </button>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="ingredients" className="flex flex-col gap-3">
          <h2 id="ingredients" className="text-xl font-bold">
            {he.recipe.ingredients}
          </h2>
          <ul className="flex flex-col divide-y divide-rule rounded-2xl bg-white ring-1 ring-rule">
            {recipe.ingredients.map((i) => (
              <li key={i.id} className="flex items-baseline gap-2 px-4 py-3 text-base">
                <span className="flex-1">{i.displayText}</span>
                {i.optional && <span className="text-xs text-muted">{he.recipe.optional}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="steps" className="flex flex-col gap-3">
          <h2 id="steps" className="text-xl font-bold">
            {he.recipe.steps}
          </h2>
          <ol className="flex flex-col gap-4">
            {recipe.steps.map((s, index) => (
              <li key={s.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent"
                >
                  {index + 1}
                </span>
                <p className="pt-1 text-base leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
