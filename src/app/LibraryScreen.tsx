"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAccess } from "@/components/auth/AuthProvider";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BookSwitcher } from "@/components/library/BookSwitcher";
import { LibraryView, type PickMode } from "@/components/library/LibraryView";
import { useTray } from "@/components/meals/TrayProvider";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { getAccessRequests } from "@/lib/data/access";
import { addItem, addToTray, getMeal, recipeServings, swapItem, type Meal } from "@/lib/data/meals";
import { mealLabel } from "@/lib/meals/format";
import { incomingShares, syncSharedBooks, type IncomingShare } from "@/lib/data/sharing";
import { isDemo } from "@/lib/demo";
import type { Library } from "@/lib/recipes/types";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; library: Library };

/** Library (screen 1): loads the signed-in user's book. */
export function LibraryScreen() {
  const [state, setState] = useState<State>({ status: "loading" });
  const pick = usePickMode();
  const [incoming, setIncoming] = useState<IncomingShare[]>([]);
  const isAdmin = !!useAccess()?.isAdmin;
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    getAccessRequests().then(
      (r) => setWaiting(r.filter((x) => x.status === "pending").length),
      () => {},
    );
  }, [isAdmin]);

  const [synced, setSynced] = useState<{ senderName: string; added: number }[]>([]);

  useEffect(() => {
    if (isDemo) return;
    incomingShares().then(setIncoming, () => {});
  }, []);

  useEffect(() => {
    let live = true;
    const load = () =>
      getLibrary().then(
        (library) => live && setState({ status: "ready", library }),
        () => live && setState({ status: "error" }),
      );
    load();
    // Books shared whole with this user: copy in what was added since.
    if (!isDemo)
      syncSharedBooks().then(
        (news) => {
          if (!live || news.length === 0) return;
          setSynced(news);
          load();
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, []);

  const library = state.status === "ready" ? state.library : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          {isDemo || !library?.bookId ? (
            <h1 className="text-3xl leading-tight font-bold">{library?.bookName ?? he.app.name}</h1>
          ) : (
            <BookSwitcher
              currentId={library.bookId}
              currentName={library.bookName ?? he.app.name}
              isOwner={!!library.isOwner}
            />
          )}
          {library && library.recipes.length > 0 && (
            <p className="text-sm text-muted">{he.library.count(library.recipes.length)}</p>
          )}
        </div>
        {!isDemo && (
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link
                href="/requests"
                className={`press flex h-11 items-center px-3 text-sm font-semibold ${
                  waiting ? "text-red-700" : "text-muted"
                }`}
              >
                {waiting ? he.access.requestsCount(waiting) : he.access.requests}
              </Link>
            )}
            {library?.isOwner && library.recipes.length > 0 && (
              <Link
                href="/share"
                className="press flex h-11 items-center px-3 text-sm font-semibold text-accent"
              >
                {he.library.share}
              </Link>
            )}
            <SignOutButton />
          </div>
        )}
      </header>
      {synced.map((n) => (
        <p
          key={n.senderName}
          role="status"
          className="rounded-2xl bg-accent/10 px-4 py-3 font-semibold"
        >
          {he.library.synced(n.senderName, n.added)}
        </p>
      ))}
      {incoming.length > 0 && (
        <Link
          href="/shared"
          className="press flex items-center justify-between gap-3 rounded-2xl bg-accent/10 px-4 py-3"
        >
          <span className="font-semibold">
            {he.library.incoming(incoming[0].senderName, incoming[0].recipeCount)}
          </span>
          <span className="shrink-0 text-sm font-semibold text-accent">
            {he.library.incomingAction}
          </span>
        </Link>
      )}
      {isDemo && (
        <p className="rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink">
          {he.library.demoNotice}
        </p>
      )}
      {state.status === "loading" && (
        <p className="py-16 text-center text-muted">{he.common.loading}</p>
      )}
      {state.status === "error" && (
        <p role="alert" className="py-16 text-center text-muted">
          {he.common.loadFailed}
        </p>
      )}
      {library && <LibraryView library={library} pick={pick} />}
    </div>
  );
}

/**
 * Choosing a dish for a meal (PRD §8.2): ?pick=<dish>&meal=<meal> swaps that
 * dish, ?add=<meal> adds one; then back to the meal.
 */
function usePickMode(): PickMode | undefined {
  const params = useSearchParams();
  const router = useRouter();
  const tray = useTray();
  const mealId = params.get("meal") ?? params.get("add");
  const itemId = params.get("pick");
  const [meal, setMeal] = useState<Meal | null>(null);

  useEffect(() => {
    if (!mealId) return;
    getMeal(mealId).then(setMeal, () => {});
  }, [mealId]);

  return useMemo(() => {
    if (!mealId || !meal) return undefined;
    const back = () => router.push(`/meals?id=${meal.id}`);
    const item = itemId ? meal.items.find((i) => i.id === itemId) : undefined;
    return {
      label: item
        ? he.meals.pickSwap(item.title)
        : he.meals.pickAdd(mealLabel(meal.title, meal.date) || he.meals.trayTitle),
      onCancel: back,
      onPick: async (recipe) => {
        const servings = await recipeServings(recipe.id);
        if (item) await swapItem(item.id, recipe.id, servings);
        else if (meal.status === "draft") await addToTray(recipe.id);
        else await addItem(meal, recipe.id, servings);
        tray.refresh();
        back();
      },
    };
  }, [mealId, meal, itemId, router, tray]);
}
