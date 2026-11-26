"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { getCurrentBook, type CurrentBook } from "@/lib/data/book";
import { bookMembers, removeMember, type BookMember } from "@/lib/data/books";
import { withBase, isDemo } from "@/lib/demo";
import {
  getMyName,
  isEmail,
  normalizeEmail,
  createShareLink,
  sentShares,
  ShareError,
  shareRecipes,
  stopUpdates,
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
  members: BookMember[];
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
        const owner = book.role === "owner";
        const [library, name, sent, members] = await Promise.all([
          getLibrary(),
          getMyName(),
          owner ? sentShares(book.id) : Promise.resolve([]),
          owner ? bookMembers(book.id) : Promise.resolve([]),
        ]);
        setLoaded({ book, recipes: library.recipes, name, sent, members });
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
  const [members, setMembers] = useState(loaded.members);
  const [canAdd, setCanAdd] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [how, setHow] = useState<"link" | "email">("link");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => searchItems(recipes, query, (r) => r.searchText), [recipes, query]);
  const previous = [...new Set(sent.map((s) => s.toEmail).filter((e): e is string => !!e))].filter(
    (e) => !emails.includes(e),
  );

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

  async function makeLink() {
    if (mode === "chosen" && selected.size === 0) return setError(he.share.errors.noRecipes);
    if (!name.trim()) return setError(he.share.errors.noName);
    setPending(true);
    setError(undefined);
    try {
      const url = await createShareLink({
        book,
        recipeIds: mode === "book" ? null : [...selected],
        senderName: name,
        canAdd: mode === "book" && canAdd,
        origin: window.location.origin,
        path: (token) => withBase(`/shared?t=${encodeURIComponent(token)}`),
      });
      setLink(url);
      setCopied(false);
      setSent(await sentShares(book.id));
    } catch (e) {
      const code = e instanceof ShareError ? e.message : "default";
      setError(he.share.errors[code] ?? he.share.errors.default);
    } finally {
      setPending(false);
    }
  }

  async function share() {
    if (how === "link") return makeLink();
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
        canAdd: mode === "book" && canAdd,
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

  async function stop(id: string) {
    try {
      await stopUpdates(id);
      setSent(sent.map((s) => (s.id === id ? { ...s, follow: false } : s)));
    } catch {
      setError(he.share.errors.default);
    }
  }

  async function remove(userId: string) {
    try {
      await removeMember(book.id, userId);
      setMembers(members.filter((m) => m.userId !== userId));
    } catch {
      setError(he.share.errors.default);
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
              <span className="truncate font-medium" dir={s.toEmail ? "ltr" : undefined}>
                {s.byLink ? `${he.share.sentLink} · ${s.toEmail ?? he.share.notOpened}` : s.toEmail}
              </span>
              <span className="text-muted">
                {s.canAdd ? he.share.sentJoin : he.share.sentWhat(s.recipeCount)} ·{" "}
                {s.status === "accepted"
                  ? s.canAdd
                    ? he.share.joined
                    : he.share.status.accepted(s.addedCount)
                  : he.share.status[s.status]}
                {s.follow && ` · ${he.share.following}`}
              </span>
            </div>
            {s.follow && (
              <button
                type="button"
                onClick={() => stop(s.id)}
                className="press h-11 px-2 font-semibold text-muted"
              >
                {he.share.stopUpdates}
              </button>
            )}
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

  const membersList = members.length > 0 && (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{he.share.membersTitle}</h2>
      <p className="text-sm text-muted">{he.share.membersHint}</p>
      <ul className="flex flex-col divide-y divide-rule rounded-2xl bg-white ring-1 ring-rule">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{m.name}</span>
              <span className="truncate text-muted" dir="ltr">
                {m.email}
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(m.userId)}
              className="press h-11 px-2 font-semibold text-red-700"
            >
              {he.share.removeMember}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  if (link) {
    const message = he.share.linkMessage(name.trim(), link);
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule">
          <h2 className="text-xl font-bold">{he.share.linkTitle}</h2>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">{he.share.linkLabel}</span>
            <input
              readOnly
              value={link}
              dir="ltr"
              onFocus={(e) => e.target.select()}
              className="h-12 w-full rounded-xl border border-rule bg-paper px-3 text-sm"
            />
          </label>
          <p className="text-sm text-muted">{he.share.linkHint}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="press h-12 flex-1 rounded-full bg-white font-semibold ring-1 ring-rule"
            >
              {copied ? he.share.copied : he.share.copyLink}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ text: message });
                  else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
                } catch {
                  // Closing the share sheet isn't an error.
                }
              }}
              className="press h-12 flex-1 rounded-full bg-accent font-semibold text-white"
            >
              {he.share.sendLink}
            </button>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={makeLink}
            className="press h-11 font-semibold text-accent"
          >
            {he.share.anotherLink}
          </button>
          <button
            type="button"
            onClick={() => setLink(null)}
            className="press h-11 font-semibold text-muted"
          >
            {he.share.again}
          </button>
        </section>
        {sentList}
      </div>
    );
  }

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
        {membersList}
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
        {mode === "book" && (
          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                checked={canAdd}
                onChange={(e) => setCanAdd(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-accent"
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{he.share.canAdd}</span>
                <span className="text-sm text-muted">{he.share.canAddHint}</span>
              </span>
            </label>
            {!canAdd && <p className="text-sm text-muted">{he.share.followNote}</p>}
          </div>
        )}
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
        <div role="group" className="flex gap-2">
          <button
            type="button"
            aria-pressed={how === "link"}
            onClick={() => setHow("link")}
            className={choice(how === "link")}
          >
            {he.share.howLink}
          </button>
          <button
            type="button"
            aria-pressed={how === "email"}
            onClick={() => setHow("email")}
            className={choice(how === "email")}
          >
            {he.share.howEmail}
          </button>
        </div>
        {how === "link" ? (
          <p className="text-sm text-muted">{he.share.linkHint}</p>
        ) : (
          <>
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
          </>
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
        {how === "link"
          ? pending
            ? he.share.creatingLink
            : he.share.createLink
          : pending
            ? he.share.sharing
            : he.share.submit(
                emails.length +
                  (isEmail(emailInput) && !emails.includes(normalizeEmail(emailInput)) ? 1 : 0) ||
                  1,
              )}
      </button>
      {membersList}
      {sentList}
    </div>
  );
}
