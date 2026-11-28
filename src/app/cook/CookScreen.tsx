"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery, useWakeLock } from "@/components/cook/hooks";
import { IngredientRows } from "@/components/cook/IngredientRows";
import { IngredientsSheet } from "@/components/cook/IngredientsSheet";
import { he } from "@/i18n/he";
import { getRecipe } from "@/lib/data";
import {
  checkIngredient,
  endSession,
  hasProgress,
  loadSession,
  restartSession,
  setStep,
  startSession,
  watchSession,
  type CookRow,
} from "@/lib/data/cook";
import { clampStep, cookProgress, CookSync, type CookSnapshot } from "@/lib/cook";
import { isDemo } from "@/lib/demo";
import type { RecipeDetail } from "@/lib/recipes/types";

/** Critically damped (PLAN §5). */
const SETTLE = { type: "spring", bounce: 0, visualDuration: 0.3 } as const;

/** Cook mode (screen 3, PRD §14): /cook?id=<recipe>. */
export function CookScreen() {
  const id = useSearchParams().get("id") ?? "";
  return <CookLoader key={id} id={id} />;
}

type Loaded =
  { status: "loading" } | { status: "error" } | { status: "ready"; recipe: RecipeDetail | null };

function CookLoader({ id }: { id: string }) {
  const [state, setState] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let live = true;
    getRecipe(id).then(
      (recipe) => live && setState({ status: "ready", recipe }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (state.status === "ready" && state.recipe)
      document.title = `${he.recipe.cookMode} · ${state.recipe.title} · ${he.app.name}`;
  }, [state]);

  if (state.status === "loading")
    return <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  if (state.status === "error" || !state.recipe)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-2xl font-bold">
          {state.status === "error" ? he.common.loadFailed : he.recipe.notFound}
        </h1>
        <Link href="/" className="press flex h-11 items-center font-medium text-accent">
          {he.recipe.back}
        </Link>
      </div>
    );
  return <Cook recipe={state.recipe} />;
}

/**
 * Where the cook is (step and checks) is stored per person and recipe, so
 * every screen they open it on shows the same and follows the others. If
 * storing fails (offline, or an older database), cooking goes on on this
 * screen alone.
 */
function Cook({ recipe }: { recipe: RecipeDetail }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const wide = useMediaQuery("(min-width: 768px)");
  const screenOn = useWakeLock();
  const [wakeNoteClosed, setWakeNoteClosed] = useState(false);
  const [snap, setSnap] = useState<CookSnapshot>({ step: 0, checked: [] });
  const [phase, setPhase] = useState<"loading" | "ask" | "cooking">(isDemo ? "cooking" : "loading");
  const [saved, setSaved] = useState<CookRow | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string>();
  const [direction, setDirection] = useState(1);

  const sync = useMemo(
    () =>
      new CookSync({
        show: setSnap,
        refetch: () => loadSession(recipe.id),
        onError: () => setError(he.cook.failed),
      }),
    [recipe.id],
  );

  useEffect(() => {
    if (isDemo) return;
    let mounted = true;
    (async () => {
      try {
        const row = (await loadSession(recipe.id)) ?? (await startSession(recipe.id));
        if (!mounted) return;
        if (hasProgress(row)) {
          setSaved(row);
          setPhase("ask");
          return;
        }
        sync.reset(row);
        setSessionId(row.id);
      } catch {
        // Cook on this screen alone.
      }
      if (mounted) setPhase("cooking");
    })();
    return () => {
      mounted = false;
    };
  }, [recipe.id, sync]);

  // Follow the other screens. Changes made before listening began, or while
  // this screen slept, are caught up by reading the stored session.
  useEffect(() => {
    if (!sessionId) return;
    const catchUp = () =>
      loadSession(recipe.id).then(
        (row) => row && sync.receive(row),
        () => {},
      );
    const stop = watchSession(
      sessionId,
      (row) => sync.receive(row),
      (on) => {
        setLive(on);
        if (on) catchUp();
      },
    );
    const onVisible = () => document.visibilityState === "visible" && catchUp();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [sessionId, recipe.id, sync]);

  const count = recipe.steps.length;
  const step = clampStep(snap.step, count);
  const last = Math.max(0, count - 1);
  const progress = cookProgress(recipe.ingredients, snap.checked);

  function goTo(target: number) {
    const next = clampStep(target, count);
    if (next === step) return;
    setDirection(next > step ? 1 : -1);
    setSnap((s) => ({ ...s, step: next }));
    if (sessionId) sync.send(() => setStep(sessionId, next));
  }

  function toggle(ingredientId: string) {
    const checked = !snap.checked.includes(ingredientId);
    setSnap((s) => ({
      ...s,
      checked: checked
        ? [...s.checked.filter((c) => c !== ingredientId), ingredientId]
        : s.checked.filter((c) => c !== ingredientId),
    }));
    if (sessionId) sync.send(() => checkIngredient(sessionId, ingredientId, checked));
  }

  async function choose(resume: boolean) {
    if (!saved) return;
    const row = resume
      ? saved
      : ((await restartSession(saved.id).catch(() => null)) ?? {
          ...saved,
          current_step: 0,
          checked_ingredient_ids: [],
        });
    sync.reset(row);
    setSessionId(saved.id);
    setPhase("cooking");
  }

  async function finish() {
    if (sessionId) await endSession(sessionId).catch(() => {});
    router.push(`/recipe?id=${recipe.id}`);
  }

  // Next comes from the reading direction's end: the left, in Hebrew.
  const slide = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -48 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 48 }),
  };
  const bigButton =
    "press flex h-14 flex-1 items-center justify-center rounded-full px-5 text-lg font-semibold disabled:opacity-40";

  return (
    <div data-live={live ? "true" : "false"} className="fixed inset-0 z-50 flex flex-col bg-paper">
      <header className="flex shrink-0 items-center gap-3 border-b border-rule px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link
          href={`/recipe?id=${recipe.id}`}
          aria-label={he.cook.exit}
          className="press flex size-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-rule"
        >
          <svg
            aria-hidden="true"
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {count > 0 ? he.cook.header(step + 1, count, recipe.title) : recipe.title}
        </h1>
      </header>

      {!screenOn && !wakeNoteClosed && (
        <div
          role="note"
          className="flex shrink-0 items-start gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          <p className="flex-1">{he.cook.wakeNote}</p>
          <button
            type="button"
            onClick={() => setWakeNoteClosed(true)}
            className="press h-9 shrink-0 px-2 font-semibold"
          >
            {he.cook.dismiss}
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {wide && (
          <aside
            aria-labelledby="cook-ingredients-title"
            className="flex w-80 shrink-0 flex-col overflow-y-auto border-e border-rule bg-white"
          >
            <h2 id="cook-ingredients-title" className="px-4 pt-4 pb-2 text-lg font-bold">
              {he.cook.ingredients(progress.done, progress.total)}
            </h2>
            <IngredientRows progress={progress} onToggle={toggle} onLastStep={() => goTo(last)} />
          </aside>
        )}

        <section
          aria-live="polite"
          className={`min-w-0 flex-1 overflow-y-auto px-6 pt-6 ${wide ? "pb-6" : "pb-40"}`}
        >
          {phase === "loading" ? (
            <p className="text-muted">{he.common.loading}</p>
          ) : count === 0 ? (
            <p className="text-xl text-muted">{he.cook.noSteps}</p>
          ) : (
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.p
                key={step}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={SETTLE}
                className="text-[clamp(1.75rem,6vw,3rem)] leading-tight font-medium"
              >
                {recipe.steps[step].text}
              </motion.p>
            </AnimatePresence>
          )}
        </section>

        {!wide && phase !== "loading" && (
          <IngredientsSheet progress={progress} onToggle={toggle} onLastStep={() => goTo(last)} />
        )}
      </div>

      {error && (
        <p role="alert" className="shrink-0 px-4 pt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <footer className="relative z-20 flex shrink-0 gap-3 border-t border-rule bg-paper px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => goTo(step - 1)}
          disabled={phase !== "cooking" || step === 0}
          className={`${bigButton} bg-white ring-1 ring-rule`}
        >
          {he.cook.prev}
        </button>
        {step < last ? (
          <button
            type="button"
            onClick={() => goTo(step + 1)}
            disabled={phase !== "cooking"}
            className={`${bigButton} bg-accent text-white`}
          >
            {he.cook.next}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={phase !== "cooking"}
            className={`${bigButton} bg-accent text-white`}
          >
            {he.cook.finish}
          </button>
        )}
      </footer>

      {phase === "ask" && saved && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/40 p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cook-resume-title"
            className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-6 shadow-xl"
          >
            <h2 id="cook-resume-title" className="text-xl font-bold">
              {he.cook.resumeTitle}
            </h2>
            <p className="text-muted">
              {he.cook.resumeWhere(
                clampStep(saved.current_step, count) + 1,
                count,
                cookProgress(recipe.ingredients, saved.checked_ingredient_ids).done,
              )}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => choose(true)}
                className="press h-12 flex-1 rounded-full bg-accent px-4 text-base font-semibold text-white"
              >
                {he.cook.resume}
              </button>
              <button
                type="button"
                onClick={() => choose(false)}
                className="press h-12 flex-1 rounded-full bg-white px-4 text-base font-semibold ring-1 ring-rule"
              >
                {he.cook.restart}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
