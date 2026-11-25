"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccess } from "@/components/auth/AuthProvider";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LibraryView } from "@/components/library/LibraryView";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { getAccessRequests } from "@/lib/data/access";
import { incomingShares, type IncomingShare } from "@/lib/data/sharing";
import { isDemo } from "@/lib/demo";
import type { Library } from "@/lib/recipes/types";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; library: Library };

/** Library (screen 1): loads the signed-in user's book. */
export function LibraryScreen() {
  const [state, setState] = useState<State>({ status: "loading" });
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

  useEffect(() => {
    if (isDemo) return;
    incomingShares().then(setIncoming, () => {});
  }, []);

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
            {library && library.recipes.length > 0 && (
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
      {library && <LibraryView library={library} />}
    </div>
  );
}
