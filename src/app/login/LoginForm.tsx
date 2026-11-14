"use client";

import { useActionState } from "react";
import { he } from "@/i18n/he";
import { loginAction, type LoginState } from "./actions";

const field =
  "block h-12 w-full rounded-xl border border-rule bg-white px-4 text-base text-ink outline-none focus:border-accent";
const primary =
  "h-12 w-full rounded-xl bg-accent text-base font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-60";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: "email",
    email: "",
    error: initialError,
  });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {state.step === "email" ? (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{he.auth.emailLabel}</span>
            <input
              name="email"
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              defaultValue={state.email}
              className={field}
            />
          </label>
          <button name="intent" value="send" disabled={pending} className={primary}>
            {pending ? he.auth.sending : he.auth.sendCode}
          </button>
        </>
      ) : (
        <>
          <p className="text-base">{he.auth.sentTo(state.email)}</p>
          <input type="hidden" name="email" value={state.email} />
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
              className={`${field} text-center text-2xl tracking-[0.5em]`}
            />
          </label>
          <button name="intent" value="verify" disabled={pending} className={primary}>
            {pending ? he.auth.verifying : he.auth.verify}
          </button>
          <p className="text-sm text-muted">{he.auth.orLink}</p>
          <button
            name="intent"
            value="change-email"
            formNoValidate
            className="h-11 text-sm font-medium text-accent"
          >
            {he.auth.changeEmail}
          </button>
        </>
      )}

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
