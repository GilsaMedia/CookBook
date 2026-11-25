"use client";

import { useState, type FormEvent } from "react";
import { he } from "@/i18n/he";
import { BookError, createBook, listBooks, renameBook, type BookSummary } from "@/lib/data/books";
import { selectBook } from "@/lib/data/current-book";

const field =
  "h-12 w-full rounded-xl border border-rule bg-white px-4 text-base outline-none focus:border-accent";

/**
 * The book's name, as a button: lists the user's books (their own and ones
 * shared with them) to switch between, opens a new one, renames this one.
 * Switching reloads the app in the chosen book.
 */
export function BookSwitcher({
  currentId,
  currentName,
  isOwner,
}: {
  currentId: string | null;
  currentName: string;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [mode, setMode] = useState<"list" | "new" | "rename">("list");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setMode("list");
    setError(undefined);
    try {
      setBooks(await listBooks());
    } catch {
      setError(he.books.errors.default);
    }
  }

  function go(id: string) {
    selectBook(id);
    window.location.reload();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (mode === "new") go(await createBook(name));
      else if (currentId) {
        await renameBook(currentId, name);
        window.location.reload();
      }
    } catch (err) {
      const code = err instanceof BookError ? err.message : "default";
      setError(he.books.errors[code] ?? he.books.errors.default);
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <h1 className="text-3xl leading-tight font-bold">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${currentName} · ${he.books.switchLabel}`}
          onClick={toggle}
          className="press flex items-center gap-2 text-start"
        >
          {currentName}
          <svg
            aria-hidden="true"
            className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h1>

      {open && (
        <div className="absolute start-0 top-full z-30 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-rule">
          {mode === "list" ? (
            <>
              <ul className="flex flex-col">
                {(books ?? []).map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => go(b.id)}
                      aria-current={b.id === currentId}
                      className={`press flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-start ${
                        b.id === currentId ? "bg-accent/10 font-semibold" : ""
                      }`}
                    >
                      <span>{b.name}</span>
                      <span className="text-xs text-muted">
                        {b.role === "owner" ? he.books.mine : he.books.member}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 border-t border-rule pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("new");
                    setName("");
                  }}
                  className="press h-11 flex-1 rounded-xl font-semibold text-accent"
                >
                  + {he.books.newBook}
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("rename");
                      setName(currentName);
                    }}
                    className="press h-11 flex-1 rounded-xl font-semibold text-muted"
                  >
                    {he.books.rename}
                  </button>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  {mode === "new" ? he.books.newName : he.books.renameLabel}
                </span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={field}
                />
              </label>
              <div className="flex gap-2">
                <button
                  disabled={pending || !name.trim()}
                  className="press h-11 flex-1 rounded-xl bg-accent font-semibold text-white disabled:opacity-60"
                >
                  {pending ? he.books.creating : mode === "new" ? he.books.create : he.books.save}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="press h-11 flex-1 rounded-xl font-semibold text-muted"
                >
                  {he.books.cancel}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
