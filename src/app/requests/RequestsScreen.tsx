"use client";

import { useEffect, useState } from "react";
import { useAccess } from "@/components/auth/AuthProvider";
import { he } from "@/i18n/he";
import { decideAccess, getAccessRequests, type AccessRequest } from "@/lib/data/access";
import { isDemo } from "@/lib/demo";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });

/**
 * Who opened an account and waits to be let in. Approving opens the app to
 * them (their own empty book); until then the database gives them nothing.
 */
export function RequestsScreen() {
  const access = useAccess();
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const admin = !!access?.isAdmin;

  useEffect(() => {
    if (!admin) return;
    getAccessRequests().then(setRequests, () => setError(he.access.failed));
  }, [admin]);

  async function decide(r: AccessRequest, approve: boolean) {
    setBusy(r.userId);
    setError(undefined);
    try {
      await decideAccess(r.userId, approve);
      setRequests(await getAccessRequests());
    } catch {
      setError(he.access.failed);
    } finally {
      setBusy(null);
    }
  }

  let body;
  if (isDemo || access === null || (access && !access.isAdmin))
    body = <p className="text-muted">{he.access.adminsOnly}</p>;
  else if (!requests && !error)
    body = <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  else if (requests && requests.length === 0) body = <p className="text-muted">{he.access.none}</p>;
  else
    body = (
      <ul className="flex flex-col gap-3">
        {(requests ?? []).map((r) => (
          <li
            key={r.userId}
            className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-rule"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{r.name || he.access.noName}</span>
              <span className="text-sm" dir="ltr">
                <span className="block text-end">{r.email}</span>
              </span>
              <span className="text-sm text-muted">{he.access.requested(date(r.requestedAt))}</span>
            </div>
            {r.status === "pending" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.userId}
                  onClick={() => decide(r, true)}
                  className="press h-11 flex-1 rounded-full bg-accent font-semibold text-white disabled:opacity-60"
                >
                  {he.access.approve}
                </button>
                <button
                  type="button"
                  disabled={busy === r.userId}
                  onClick={() => decide(r, false)}
                  className="press h-11 flex-1 rounded-full bg-white font-semibold text-red-700 ring-1 ring-rule disabled:opacity-60"
                >
                  {he.access.reject}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={r.status === "approved" ? "text-green-800" : "text-red-700"}>
                  {r.status === "approved" ? he.access.approved : he.access.rejected}
                </span>
                {r.status === "rejected" && (
                  <button
                    type="button"
                    disabled={busy === r.userId}
                    onClick={() => decide(r, true)}
                    className="press h-11 font-semibold text-accent"
                  >
                    {he.access.undo}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{he.access.requestsTitle}</h1>
      <p className="text-sm text-muted">{he.access.requestsIntro}</p>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {body}
    </div>
  );
}
