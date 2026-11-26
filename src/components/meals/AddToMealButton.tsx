"use client";

import { useState } from "react";
import { he } from "@/i18n/he";
import { useTray } from "./TrayProvider";

/** "הוספה לארוחה +" on the recipe page: onto the tray. */
export function AddToMealButton({ recipeId }: { recipeId: string }) {
  const tray = useTray();
  const [state, setState] = useState<"idle" | "busy" | "added" | "failed">("idle");
  if (!tray.canPlan) return null;

  async function add() {
    setState("busy");
    try {
      await tray.add(recipeId);
      setState("added");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={add}
      className="press h-12 flex-1 rounded-full bg-accent px-5 text-base font-semibold text-white disabled:opacity-60"
    >
      {state === "added"
        ? he.meals.added
        : state === "failed"
          ? he.meals.failed
          : he.recipe.addToMeal}
    </button>
  );
}
