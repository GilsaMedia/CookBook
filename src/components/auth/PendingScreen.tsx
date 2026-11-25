"use client";

import { useEffect, useState, type FormEvent } from "react";
import { he } from "@/i18n/he";
import { getMyName, saveMyName } from "@/lib/data/access";
import { SignOutButton } from "./SignOutButton";

/**
 * What a new account sees until an admin approves it (or after a no). The
 * name they write is what the admin sees on the request.
 */
export function PendingScreen({
  status,
  onCheck,
}: {
  status: "pending" | "rejected";
  onCheck: () => void;
}) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Never over what they've already typed.
    getMyName().then((saved) => setName((typed) => typed || saved), () => {});
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await saveMyName(name);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5 pt-12">
      <h1 className="text-2xl font-semibold">
        {status === "pending" ? he.access.pendingTitle : he.access.rejectedTitle}
      </h1>
      <p>{status === "pending" ? he.access.pendingText : he.access.rejectedText}</p>
      {status === "pending" && (
        <>
          <form onSubmit={save} className="flex flex-col gap-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{he.access.nameLabel}</span>
              <input
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                className="h-12 w-full rounded-xl border border-rule bg-white px-4 text-base outline-none focus:border-accent"
              />
            </label>
            <button className="press h-11 rounded-xl bg-white font-semibold ring-1 ring-rule">
              {he.access.saveName}
            </button>
            {saved && (
              <p role="status" className="text-sm text-green-800">
                {he.access.nameSaved}
              </p>
            )}
          </form>
          <button
            type="button"
            onClick={onCheck}
            className="press h-12 rounded-full bg-accent font-semibold text-white"
          >
            {he.access.checkAgain}
          </button>
        </>
      )}
      <div className="self-start">
        <SignOutButton />
      </div>
    </div>
  );
}
