"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Ref } from "react";
import { he } from "@/i18n/he";
import type { cookProgress } from "@/lib/cook";

export type Progress = ReturnType<typeof cookProgress>;

/** Critically damped: things settle without bouncing (PLAN §5). */
const SETTLE = { type: "spring", bounce: 0, visualDuration: 0.3 } as const;

/**
 * Cook mode's ingredients: the whole row checks one off; checked rows are
 * struck through and sink below the rest. When everything's in, a note
 * leads to the last step. `firstRef` marks the top row (what a collapsed
 * sheet shows).
 */
export function IngredientRows({
  progress,
  onToggle,
  onLastStep,
  firstRef,
}: {
  progress: Progress;
  onToggle: (id: string) => void;
  onLastStep: () => void;
  firstRef?: Ref<HTMLLIElement>;
}) {
  const reduce = useReducedMotion();
  const { ordered, allDone, total, done } = progress;

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {total === 0 && (
        <li ref={firstRef} className="px-4 py-3 text-muted">
          {he.cook.noIngredients}
        </li>
      )}
      {allDone && (
        <li ref={firstRef} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span role="status" className="flex-1 text-lg font-bold text-green-800">
            {he.cook.allIn}
          </span>
          <button
            type="button"
            onClick={onLastStep}
            className="press h-11 rounded-full bg-accent px-4 text-base font-semibold text-white"
          >
            {he.cook.toLastStep}
          </button>
        </li>
      )}
      {ordered.map((i, index) => {
        const checked = index >= total - done;
        return (
          <motion.li
            key={i.id}
            ref={index === 0 && !allDone ? firstRef : undefined}
            layout={reduce ? false : "position"}
            transition={SETTLE}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => onToggle(i.id)}
              className="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start text-lg"
            >
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 ${
                  checked ? "border-accent bg-accent text-white" : "border-rule"
                }`}
              >
                {checked && "✓"}
              </span>
              <span className={`flex-1 ${checked ? "text-muted line-through" : ""}`}>
                {i.displayText}
              </span>
              {i.optional && <span className="text-xs text-muted">{he.recipe.optional}</span>}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}
