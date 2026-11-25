"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { he } from "@/i18n/he";
import { isDemo } from "@/lib/demo";
import {
  acceptShare,
  copySharedPhotos,
  declineShare,
  incomingShares,
  previewShare,
  ShareError,
  type IncomingShare,
  type SharedRecipe,
} from "@/lib/data/sharing";

type Step =
  | { name: "loading" }
  | { name: "error" }
  | { name: "list"; shares: IncomingShare[] }
  | { name: "pick"; share: IncomingShare; recipes: SharedRecipe[] }
  | { name: "done"; count: number; tag: string };

/**
 * Shares waiting for this user: choose all or some of the recipes, and
 * they're copied into their own book, tagged "שותף מ<name>".
 */
export function SharedScreen() {
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [error, setError] = useState<string>();

  const load = async () => {
    try {
      setStep({ name: "list", shares: await incomingShares() });
    } catch {
      setStep({ name: "error" });
    }
  };

  useEffect(() => {
    if (isDemo) return;
    // Opening the only waiting share saves a tap.
    incomingShares().then(
      async (shares) => {
        if (shares.length === 1) {
          try {
            return setStep({
              name: "pick",
              share: shares[0],
              recipes: await previewShare(shares[0].id),
            });
          } catch {
            // fall back to the list
          }
        }
        setStep({ name: "list", shares });
      },
      () => setStep({ name: "error" }),
    );
  }, []);

  async function open(share: IncomingShare) {
    setError(undefined);
    try {
      setStep({ name: "pick", share, recipes: await previewShare(share.id) });
    } catch (e) {
      const code = e instanceof ShareError ? e.message : "default";
      setError(he.shared.errors[code] ?? he.shared.errors.default);
    }
  }

  let body;
  if (isDemo) body = <p className="text-muted">{he.importer.demo}</p>;
  else if (step.name === "loading")
    body = <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  else if (step.name === "error") body = <p className="text-muted">{he.common.loadFailed}</p>;
  else if (step.name === "list")
    body =
      step.shares.length === 0 ? (
        <p className="text-muted">{he.shared.none}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {step.shares.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => open(s)}
                className="press flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-start ring-1 ring-rule"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">{he.shared.from(s.senderName)}</span>
                  <span className="text-sm text-muted">
                    {s.recipeCount === null ? he.shared.whole : he.share.sentWhat(s.recipeCount)}
                  </span>
                </span>
                <span className="text-sm font-semibold text-accent">{he.shared.pick}</span>
              </button>
            </li>
          ))}
        </ul>
      );
  else if (step.name === "pick")
    body = (
      <Pick
        share={step.share}
        recipes={step.recipes}
        onDone={(count) =>
          setStep({ name: "done", count, tag: he.share.tag(step.share.senderName) })
        }
        onDeclined={load}
      />
    );
  else
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold">{he.shared.added(step.count, step.tag)}</p>
        <Link
          href="/"
          className="press flex h-12 items-center justify-center rounded-full bg-accent font-semibold text-white"
        >
          {he.shared.toLibrary}
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{he.shared.title}</h1>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {body}
    </div>
  );
}

function Pick({
  share,
  recipes,
  onDone,
  onDeclined,
}: {
  share: IncomingShare;
  recipes: SharedRecipe[];
  onDone: (count: number) => void;
  onDeclined: () => void;
}) {
  const [selected, setSelected] = useState(new Set(recipes.map((r) => r.id)));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  // Grouped by category, in the order they come.
  const groups = useMemo(() => {
    const map = new Map<string, SharedRecipe[]>();
    for (const r of recipes) {
      const key = r.category ?? "";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [recipes]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function add() {
    setError(undefined);
    setStatus(he.shared.adding);
    try {
      const count = await acceptShare(share.id, [...selected]);
      await copySharedPhotos(share.id, (done, total) => setStatus(he.shared.photos(done, total)));
      onDone(count);
    } catch (e) {
      const code = e instanceof ShareError ? e.message : "default";
      setError(he.shared.errors[code] ?? he.shared.errors.default);
      setStatus(null);
    }
  }

  async function decline() {
    try {
      await declineShare(share.id);
      onDeclined();
    } catch {
      setError(he.shared.errors.default);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{he.shared.from(share.senderName)}</h2>
      <p className="text-sm text-muted">{he.shared.intro}</p>
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => setSelected(new Set(recipes.map((r) => r.id)))}
          className="press h-11 font-semibold text-accent"
        >
          {he.share.selectAll}
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="press h-11 font-semibold text-muted"
        >
          {he.share.clear}
        </button>
      </div>
      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
        {groups.map(([category, list]) => (
          <section key={category} className="flex flex-col gap-1">
            {category && <h3 className="text-sm font-bold text-muted">{category}</h3>}
            <ul className="flex flex-col divide-y divide-rule rounded-2xl bg-white ring-1 ring-rule">
              {list.map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="size-5 shrink-0 accent-accent"
                    />
                    <span>{r.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!!status || selected.size === 0}
        onClick={add}
        className="press h-12 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
      >
        {status ?? he.shared.add(selected.size)}
      </button>
      <button
        type="button"
        disabled={!!status}
        onClick={decline}
        className="press h-11 font-semibold text-muted"
      >
        {he.shared.decline}
      </button>
    </div>
  );
}
