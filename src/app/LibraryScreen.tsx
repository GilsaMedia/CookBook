"use client";

import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LibraryView } from "@/components/library/LibraryView";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { isDemo } from "@/lib/demo";
import type { Library } from "@/lib/recipes/types";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; library: Library };

/** Library (screen 1): loads the signed-in user's book. */
export function LibraryScreen() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    getLibrary().then(
      (library) => live && setState({ status: "ready", library }),
      () => live && setState({ status: "error" }),
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
          <h1 className="text-3xl leading-tight font-bold">{library?.bookName ?? he.app.name}</h1>
          {library && library.recipes.length > 0 && (
            <p className="text-sm text-muted">{he.library.count(library.recipes.length)}</p>
          )}
        </div>
        {!isDemo && <SignOutButton />}
      </header>
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
      {library && <LibraryView library={library} />}
    </div>
  );
}
