"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { he } from "@/i18n/he";

export type LoginState = { step: "email" | "code"; email: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Sends the sign-in email (link + 6-digit code), or verifies the code. */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = formData.get("intent");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (intent === "change-email") return { step: "email", email: prev.email };

  const supabase = await createClient();

  if (intent === "verify") {
    const email = String(formData.get("email") ?? "");
    const token = String(formData.get("code") ?? "").replace(/\D/g, "");
    if (token.length !== 6) return { step: "code", email, error: he.auth.errors.badCode };
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { step: "code", email, error: he.auth.errors.badCode };
    redirect(next);
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) return { step: "email", email, error: he.auth.errors.invalidEmail };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    // Never log the address itself.
    console.error("signInWithOtp failed", error.status, error.code);
    return { step: "email", email, error: he.auth.errors.sendFailed };
  }
  return { step: "code", email };
}
