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
const link = "press h-11 text-sm font-medium text-accent";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

type Mode = "signIn" | "signUp" | "forgot" | "verify" | "resetSent";

/** Where email links land; the page signs in from the link and moves on. */
const callbackUrl = (next: string) => {
  const url = new URL(withBase("/auth/callback"), window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
};

/**
 * Email + password. The email is used once, to verify the address when the
 * account is opened (and again only to reset a forgotten password).
 */
export function LoginForm({
  next,
  notice,
}: {
  next: string;
  notice?: { text: string; ok: boolean };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | undefined>(notice);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [pending, setPending] = useState(false);

  const go = (m: Mode) => {
    setMode(m);
    setMessage(undefined);
    setUnconfirmed(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) return setMessage({ text: he.auth.errors.invalidEmail, ok: false });
    if (mode === "signUp" && password.length < MIN_PASSWORD) {
      return setMessage({ text: he.auth.errors.shortPassword, ok: false });
    }
    setPending(true);
    setMessage(undefined);
    setUnconfirmed(false);
    const auth = supabase().auth;
    try {
      if (mode === "signIn") {
        const { error } = await auth.signInWithPassword({ email: address, password });
        if (!error) return router.replace(next);
        if (error.code === "email_not_confirmed") {
          setUnconfirmed(true);
          return setMessage({ text: he.auth.errors.notConfirmed, ok: false });
        }
        return setMessage({ text: he.auth.errors.badLogin, ok: false });
      }
      if (mode === "signUp") {
        const { data, error } = await auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: callbackUrl(next) },
        });
        if (error) {
          const exists = error.code === "user_already_exists";
          return setMessage({
            text: exists ? he.auth.errors.exists : he.auth.errors.sendFailed,
            ok: false,
          });
        }
        // Verification off (local development): signed in at once.
        if (data.session) return router.replace(next);
        // An existing address comes back with no identities (Supabase hides it).
        if (data.user && data.user.identities?.length === 0) {
          return setMessage({ text: he.auth.errors.exists, ok: false });
        }
        setEmail(address);
        return setMode("verify");
      }
      if (mode === "forgot") {
        const { error } = await auth.resetPasswordForEmail(address, {
          redirectTo: callbackUrl("/auth/reset"),
        });
        if (error) return setMessage({ text: he.auth.errors.sendFailed, ok: false });
        setEmail(address);
        return setMode("resetSent");
      }
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setPending(true);
    const { error } = await supabase().auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callbackUrl(next) },
    });
    setPending(false);
    setMessage(
      error ? { text: he.auth.errors.sendFailed, ok: false } : { text: he.auth.resent, ok: true },
    );
  }

  const status = message && (
    <p
      role={message.ok ? "status" : "alert"}
      className={`text-sm font-medium ${message.ok ? "text-green-800" : "text-red-700"}`}
    >
      {message.text}
    </p>
  );

  if (mode === "verify" || mode === "resetSent") {
    return (
      <div className="flex flex-col gap-4">
        {mode === "verify" && <h2 className="text-lg font-bold">{he.auth.verifyTitle}</h2>}
        <p className="text-base">
          {mode === "verify" ? he.auth.verifySent(email) : he.auth.resetSent(email)}
        </p>
        {mode === "verify" && (
          <button type="button" disabled={pending} onClick={resend} className={link}>
            {he.auth.resend}
          </button>
        )}
        {status}
        <button type="button" onClick={() => go("signIn")} className={primary}>
          {he.auth.back}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {mode !== "signIn" && (
        <h2 className="text-lg font-bold">
          {mode === "signUp" ? he.auth.signUpTitle : he.auth.forgotTitle}
        </h2>
      )}
      {mode === "forgot" && <p className="text-sm text-muted">{he.auth.forgotIntro}</p>}
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
      {mode !== "forgot" && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {mode === "signUp" ? he.auth.newPasswordLabel : he.auth.passwordLabel}
          </span>
          <input
            name="password"
            type="password"
            dir="ltr"
            required
            minLength={mode === "signUp" ? MIN_PASSWORD : undefined}
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>
      )}
      <button disabled={pending} className={primary}>
        {pending
          ? mode === "signUp"
            ? he.auth.signingUp
            : mode === "forgot"
              ? he.auth.sending
              : he.auth.signingIn
          : mode === "signUp"
            ? he.auth.signUp
            : mode === "forgot"
              ? he.auth.sendReset
              : he.auth.signIn}
      </button>
      {status}
      {unconfirmed && (
        <button type="button" disabled={pending} onClick={resend} className={link}>
          {he.auth.resend}
        </button>
      )}
      <div className="flex flex-col items-start">
        {mode === "signIn" && (
          <>
            <button type="button" onClick={() => go("signUp")} className={link}>
              {he.auth.toSignUp}
            </button>
            <button type="button" onClick={() => go("forgot")} className={`${link} text-muted`}>
              {he.auth.forgot}
            </button>
          </>
        )}
        {mode !== "signIn" && (
          <button type="button" onClick={() => go("signIn")} className={link}>
            {mode === "signUp" ? he.auth.toSignIn : he.auth.back}
          </button>
        )}
      </div>
    </form>
  );
}
