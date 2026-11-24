"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeView } from "@/components/recipe/RecipeView";
import { he } from "@/i18n/he";
import { getRecipe } from "@/lib/data";
import type { RecipeDetail } from "@/lib/recipes/types";

type State =
  { status: "loading" } | { status: "error" } | { status: "ready"; recipe: RecipeDetail | null };

/** Recipe page for ?id=. A new id remounts the loader, so it starts fresh. */
export function RecipeScreen() {
  const id = useSearchParams().get("id") ?? "";
  return <RecipeLoader key={id} id={id} />;
}

/** Loads one recipe; RLS decides whether this user may see it. */
function RecipeLoader({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

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
    if (state.status !== "ready") return;
    document.title = `${state.recipe?.title ?? he.recipe.notFound} · ${he.app.name}`;
  }, [state]);

  if (state.status === "loading") {
    return <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  }
  if (state.status === "error" || !state.recipe) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-2xl font-bold">
          {state.status === "error" ? he.common.loadFailed : he.recipe.notFound}
        </h1>
        {state.status === "ready" && <p className="text-muted">{he.recipe.notFoundHint}</p>}
        <Link href="/" className="press flex h-11 items-center font-medium text-accent">
          {he.recipe.back}
        </Link>
      </div>
    );
  }
  return <RecipeView recipe={state.recipe} />;
}
