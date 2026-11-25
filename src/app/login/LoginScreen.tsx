"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/auth/AuthProvider";
import { he } from "@/i18n/he";
import { safeNext } from "@/lib/auth/redirect";
import { LoginForm } from "./LoginForm";

export function LoginScreen() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const session = useSession();
  const router = useRouter();

  // Already signed in: /login bounces to where they were going.
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, next, router]);

  const notice =
    params.get("error") === "link" ? { text: he.auth.errors.linkFailed, ok: false } : undefined;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <h1 className="text-2xl font-semibold">{he.auth.title}</h1>
      <LoginForm next={next} notice={notice} />
    </div>
  );
}
