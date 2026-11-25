"use client";

import { useState, type FormEvent } from "react";
import { he } from "@/i18n/he";
import { AiError, importRecipe } from "@/lib/ai/client";
import type { ImportResponse } from "@/lib/ai/schema";

const field =
  "block w-full rounded-xl border border-rule bg-white px-4 text-base text-ink outline-none focus:border-accent";

const tab = (active: boolean) =>
  `press h-11 flex-1 rounded-full text-sm font-semibold ${active ? "bg-ink text-paper" : "text-ink"}`;

/** Step 1 of adding a recipe: a link or pasted text, sent to the AI. */
export function ImportForm({
  bookId,
  onImported,
}: {
  bookId: string;
  onImported: (res: ImportResponse) => void;
}) {
  const [kind, setKind] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = (kind === "url" ? url : text).trim();
    if (!input) return;
    setWorking(true);
    setError(undefined);
    try {
      onImported(await importRecipe(bookId, kind, input));
    } catch (err) {
      const code = err instanceof AiError ? err.code : "default";
      setError(he.importer.errors[code] ?? he.importer.errors.default);
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={he.importer.modeLabel}
        className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-rule"
      >
        <button
          type="button"
          aria-pressed={kind === "url"}
          onClick={() => setKind("url")}
          className={tab(kind === "url")}
        >
          {he.importer.fromLink}
        </button>
        <button
          type="button"
          aria-pressed={kind === "text"}
          onClick={() => setKind("text")}
          className={tab(kind === "text")}
        >
          {he.importer.fromText}
        </button>
      </div>

      {kind === "url" ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{he.importer.linkLabel}</span>
          <input
            type="url"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${field} h-12`}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{he.importer.textLabel}</span>
          <span className="text-sm text-muted">{he.importer.textHint}</span>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={20_000}
            className={`${field} py-3 leading-relaxed`}
          />
        </label>
      )}

      <button
        disabled={working || !(kind === "url" ? url : text).trim()}
        className="press h-12 rounded-full bg-accent text-base font-semibold text-white disabled:opacity-60"
      >
        {he.importer.submit}
      </button>

      {working && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          {he.importer.working}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
