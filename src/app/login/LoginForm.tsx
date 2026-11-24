"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { he } from "@/i18n/he";
import { withBase } from "@/lib/demo";
import { supabase } from "@/lib/supabase/client";

const field =
  "block h-12 w-full rounded-xl border border-rule bg-white px-4 text-base text-ink outline-none focus:border-accent";
const primary =
  "press h-12 w-full rounded-xl bg-accent text-base font-semibold text-white disabled:opacity-60";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in without a password: Supabase emails a 6-digit code and a magic
 * link. Typing the code works on any device; the link only in this browser.
 */
export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) return setError(he.auth.errors.invalidEmail);
    setPending(true);
    setError(undefined);
    const callback = new URL(withBase("/auth/callback"), window.location.origin);
    callback.searchParams.set("next", next);
    const { error } = await supabase().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
    });
    setPending(false);
    if (error) return setError(he.auth.errors.sendFailed);
    setEmail(address);
    setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) return setError(he.auth.errors.badCode);
    setPending(true);
    setError(undefined);
    const { error } = await supabase().auth.verifyOtp({ email, token, type: "email" });
    setPending(false);
    if (error) return setError(he.auth.errors.badCode);
    router.replace(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{he.auth.emailLabel}</span>
            <input
              name="email"
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <button disabled={pending} className={primary}>
            {pending ? he.auth.sending : he.auth.sendCode}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <p className="text-base">{he.auth.sentTo(email)}</p>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{he.auth.codeLabel}</span>
            <input
              name="code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${field} text-center text-2xl tracking-[0.5em]`}
            />
          </label>
          <button disabled={pending} className={primary}>
            {pending ? he.auth.verifying : he.auth.verify}
          </button>
          <p className="text-sm text-muted">{he.auth.orLink}</p>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(undefined);
            }}
            className="press h-11 text-sm font-medium text-accent"
          >
            {he.auth.changeEmail}
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
