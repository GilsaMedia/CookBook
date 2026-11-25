"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { getCurrentBook, type CurrentBook } from "@/lib/data/book";
import { withBase, isDemo } from "@/lib/demo";
import {
  getMyName,
  isEmail,
  normalizeEmail,
  sentShares,
  ShareError,
  shareRecipes,
  withdrawShare,
  type SentShare,
} from "@/lib/data/sharing";
import type { RecipeCard } from "@/lib/recipes/types";
import { searchItems } from "@/lib/search/hebrew";

const choice = (active: boolean) =>
  `press flex h-12 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold ${
    active ? "bg-ink text-paper" : "bg-white ring-1 ring-rule"
  }`;
const field =
  "h-12 w-full rounded-xl border border-rule bg-white px-4 text-base outline-none focus:border-accent";

type Loaded = {
  book: CurrentBook;
  recipes: RecipeCard[];
  name: string;
  sent: SentShare[];
};

/**
 * Share the whole book or chosen recipes with people, by email. Each person
 * then chooses what to add to their own book (see /shared).
 */
export function ShareScreen() {
  const preselected = useSearchParams().get("recipe");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    (async () => {
      try {
        const book = await getCurrentBook();
        if (!book) return setFailed(true);
        const [library, name, sent] = await Promise.all([
          getLibrary(),
          getMyName(),
          book.role === "owner" ? sentShares(book.id) : Promise.resolve([]),
        ]);
        setLoaded({ book, recipes: library.recipes, name, sent });
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  let body;
  if (isDemo) body = <p className="text-muted">{he.importer.demo}</p>;
  else if (failed) body = <p className="text-muted">{he.common.loadFailed}</p>;
  else if (!loaded) body = <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  else if (loaded.book.role !== "owner") body = <p className="text-muted">{he.share.ownerOnly}</p>;
  else body = <ShareForm loaded={loaded} preselected={preselected} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{he.share.title}</h1>
      {body}
    </div>
  );
}

function ShareForm({ loaded, preselected }: { loaded: Loaded; preselected: string | null }) {
  const { book, recipes } = loaded;
  const [mode, setMode] = useState<"book" | "chosen">(preselected ? "chosen" : "book");
  const [selected, setSelected] = useState(
    new Set(preselected && recipes.some((r) => r.id === preselected) ? [preselected] : []),
  );
  const [query, setQuery] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState(loaded.name);
  const [sent, setSent] = useState(loaded.sent);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  const visible = useMemo(() => searchItems(recipes, query, (r) => r.searchText), [recipes, query]);
  const previous = [...new Set(sent.map((s) => s.toEmail))].filter((e) => !emails.includes(e));

  function addEmail(e?: FormEvent) {
    e?.preventDefault();
    const email = normalizeEmail(emailInput);
    if (!email) return;
    if (!isEmail(email)) return setError(he.share.errors.invalidEmail);
    setError(undefined);
    if (!emails.includes(email)) setEmails([...emails, email]);
    setEmailInput("");
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function share() {
    // A typed address counts even if "add" wasn't pressed.
    const typed = normalizeEmail(emailInput);
    const people = typed && isEmail(typed) && !emails.includes(typed) ? [...emails, typed] : emails;
    if (typed && !isEmail(typed)) return setError(he.share.errors.invalidEmail);
    if (people.length === 0) return setError(he.share.errors.noPeople);
    if (mode === "chosen" && selected.size === 0) return setError(he.share.errors.noRecipes);
    if (!name.trim()) return setError(he.share.errors.noName);
    setPending(true);
    setError(undefined);
    try {
      await shareRecipes({
        book,
        emails: people,
        recipeIds: mode === "book" ? null : [...selected],
        senderName: name,
      });
      setDone(people);
      setEmails([]);
      setEmailInput("");
      setSent(await sentShares(book.id));
    } catch (e) {
      const code = e instanceof ShareError ? e.message : "default";
      setError(he.share.errors[code] ?? he.share.errors.default);
    } finally {
      setPending(false);
    }
  }

  async function withdraw(id: string) {
    try {
      await withdrawShare(id);
      setSent(sent.filter((s) => s.id !== id));
    } catch {
      setError(he.share.errors.default);
    }
  }

  const sentList = sent.length > 0 && (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{he.share.sentTitle}</h2>
      <ul className="flex flex-col divide-y divide-rule rounded-2xl bg-white ring-1 ring-rule">
        {sent.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium" dir="ltr">
                {s.toEmail}
              </span>
              <span className="text-muted">
                {he.share.sentWhat(s.recipeCount)} ·{" "}
                {s.status === "accepted"
                  ? he.share.status.accepted(s.addedCount)
                  : he.share.status[s.status]}
              </span>
            </div>
            {s.status === "pending" && (
              <button
                type="button"
                onClick={() => withdraw(s.id)}
                className="press h-11 px-2 font-semibold text-red-700"
              >
                {he.share.withdraw}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  if (done) {
    const url = new URL(withBase("/shared"), window.location.origin).toString();
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule">
          <h2 className="text-xl font-bold">{he.share.doneTitle}</h2>
          <ul className="flex flex-col gap-1 text-sm" dir="ltr">
            {done.map((e) => (
              <li key={e} className="text-end">
                {e}
              </li>
            ))}
          </ul>
          <p>{he.share.doneText}</p>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(he.share.whatsappText(url))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press flex h-12 items-center justify-center rounded-full bg-accent font-semibold text-white"
          >
            {he.share.whatsapp}
          </a>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="press h-11 font-semibold text-accent"
          >
            {he.share.again}
          </button>
        </section>
        {sentList}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{he.share.whatTitle}</h2>
        <div role="group" className="flex gap-2">
          <button
            type="button"
            aria-pressed={mode === "book"}
            onClick={() => setMode("book")}
            className={choice(mode === "book")}
          >
            {he.share.wholeBook(recipes.length)}
          </button>
          <button
            type="button"
            aria-pressed={mode === "chosen"}
            onClick={() => setMode("chosen")}
            className={choice(mode === "chosen")}
          >
            {he.share.chosen(selected.size)}
          </button>
        </div>
        {mode === "chosen" && (
          <div className="flex flex-col gap-2">
            <input
              type="search"
              aria-label={he.share.searchLabel}
              placeholder={he.library.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={field}
            />
            <div className="flex gap-4 text-sm">
              <button
                type="button"
                onClick={() => setSelected(new Set([...selected, ...visible.map((r) => r.id)]))}
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
            <ul className="flex max-h-80 flex-col divide-y divide-rule overflow-y-auto rounded-2xl bg-white ring-1 ring-rule">
              {visible.map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="size-5 shrink-0 accent-accent"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{r.title}</span>
                      {r.categoryName && (
                        <span className="text-xs text-muted">{r.categoryName}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{he.share.whoTitle}</h2>
        <form onSubmit={addEmail} className="flex gap-2">
          <input
            type="email"
            dir="ltr"
            aria-label={he.share.emailLabel}
            placeholder="name@gmail.com"
            autoComplete="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className={field}
          />
          <button
            type="submit"
            className="press h-12 shrink-0 rounded-xl bg-white px-4 font-semibold ring-1 ring-rule"
          >
            {he.share.add}
          </button>
        </form>
        {emails.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {emails.map((e) => (
              <li key={e}>
                <button
                  type="button"
                  aria-label={he.share.remove(e)}
                  onClick={() => setEmails(emails.filter((x) => x !== e))}
                  className="press flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm text-paper"
                  dir="ltr"
                >
                  {e} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {previous.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{he.share.previous}</p>
            <ul className="flex flex-wrap gap-2">
              {previous.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    onClick={() => setEmails([...emails, e])}
                    className="press flex h-10 items-center rounded-full bg-white px-4 text-sm ring-1 ring-rule"
                    dir="ltr"
                  >
                    + {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="flex flex-col gap-2">
          <span className="text-lg font-bold">{he.share.nameTitle}</span>
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>
        {name.trim() && (
          <p className="text-sm text-muted">{he.share.nameHint(he.share.tag(name))}</p>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={share}
        className="press h-12 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
      >
        {pending
          ? he.share.sharing
          : he.share.submit(
              emails.length +
                (isEmail(emailInput) && !emails.includes(normalizeEmail(emailInput)) ? 1 : 0) || 1,
            )}
      </button>
      {sentList}
    </div>
  );
}
