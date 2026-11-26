"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { he } from "@/i18n/he";
import { withBase } from "@/lib/demo";
import { listBooks } from "@/lib/data/books";
import { selectBook, selectedBookId } from "@/lib/data/current-book";
import { isDemo } from "@/lib/demo";
import {
  acceptShare,
  claimShare,
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
  | { name: "done"; count: number; tag: string }
  | { name: "joined"; senderName: string; bookId: string };

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

  const token = useSearchParams().get("t");
  const router = useRouter();

  useEffect(() => {
    if (isDemo) return;
    (async () => {
      // A share link: it becomes this user's, then it's like any share.
      let claimed: string | null = null;
      if (token) {
        try {
          claimed = await claimShare(token);
        } catch (e) {
          const code = e instanceof ShareError ? e.message : "default";
          setError(he.shared.errors[code] ?? he.shared.errors.default);
        }
        router.replace("/shared");
      }
      const shares = await incomingShares();
      // Opening the link's share (or the only one waiting) saves a tap.
      const first =
        shares.find((s) => s.id === claimed) ?? (shares.length === 1 ? shares[0] : null);
      if (first) {
        try {
          return setStep({ name: "pick", share: first, recipes: await previewShare(first.id) });
        } catch {
          // fall back to the list
        }
      }
      setStep({ name: "list", shares });
    })().catch(() => setStep({ name: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the link it was opened with
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
  else if (step.name === "pick" && step.share.canAdd)
    body = (
      <Invite
        share={step.share}
        onJoined={() =>
          setStep({
            name: "joined",
            senderName: step.share.senderName,
            bookId: step.share.fromBookId,
          })
        }
        onDeclined={load}
      />
    );
  else if (step.name === "joined")
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold">{he.shared.joined(step.senderName)}</p>
        <button
          type="button"
          onClick={() => {
            selectBook(step.bookId);
            window.location.assign(withBase("/"));
          }}
          className="press flex h-12 items-center justify-center rounded-full bg-accent font-semibold text-white"
        >
          {he.shared.toBook}
        </button>
      </div>
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
  // Into the book the user is in, when it's theirs; else their first own book.
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const everything = selected.size === recipes.length;

  useEffect(() => {
    listBooks().then(
      (books) => {
        const own = books.filter((b) => b.role === "owner");
        const book = own.find((b) => b.id === selectedBookId()) ?? own[0];
        if (book) setTarget({ id: book.id, name: book.name });
      },
      () => {},
    );
  }, []);

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
      // Everything: null, so a whole-book share keeps following the book.
      const count = await acceptShare(share.id, everything ? null : [...selected], target?.id);
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
      {target && <p className="text-sm font-medium">{he.shared.intoBook(target.name)}</p>}
      {share.recipeCount === null && everything && (
        <p className="text-sm text-muted">{he.shared.followNote}</p>
      )}
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

/** An invitation into the sharer's book itself. */
function Invite({
  share,
  onJoined,
  onDeclined,
}: {
  share: IncomingShare;
  onJoined: () => void;
  onDeclined: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setPending(true);
    setError(undefined);
    try {
      await acceptShare(share.id, null);
      onJoined();
    } catch (e) {
      const code = e instanceof ShareError ? e.message : "default";
      setError(he.shared.errors[code] ?? he.shared.errors.default);
      setPending(false);
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
      <h2 className="text-xl font-bold">{he.shared.invite(share.senderName)}</h2>
      <p>{he.shared.inviteText}</p>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={join}
        className="press h-12 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? he.shared.joining : he.shared.join}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={decline}
        className="press h-11 font-semibold text-muted"
      >
        {he.shared.decline}
      </button>
    </div>
  );
}
