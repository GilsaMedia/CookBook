"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { MIN_PASSWORD } from "@/app/login/LoginForm";
import { useSession } from "@/components/auth/AuthProvider";
import { he } from "@/i18n/he";
import { supabase } from "@/lib/supabase/client";

/** A new password, after following the reset link (which signed them in). */
export function ResetPassword() {
  const router = useRouter();
  const session = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  // No session: the link wasn't followed, or it expired.
  useEffect(() => {
    if (session === null) router.replace("/login?error=link");
  }, [session, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(he.auth.errors.shortPassword);
    setPending(true);
    setError(undefined);
    const { error: e2 } = await supabase().auth.updateUser({ password });
    setPending(false);
    if (e2) return setError(he.auth.errors.resetFailed);
    router.replace("/");
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-4 pt-12">
      <h1 className="text-2xl font-semibold">{he.auth.resetTitle}</h1>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{he.auth.newPasswordLabel}</span>
        <input
          name="password"
          type="password"
          dir="ltr"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block h-12 w-full rounded-xl border border-rule bg-white px-4 text-base text-ink outline-none focus:border-accent"
        />
      </label>
      <button
        disabled={pending || !session}
        className="press h-12 w-full rounded-xl bg-accent text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? he.auth.resetSaving : he.auth.resetSave}
      </button>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
