"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { he } from "@/i18n/he";
import { safeNext } from "@/lib/auth/redirect";
import { supabase } from "@/lib/supabase/client";

/** Magic-link landing: trades the link's one-time code for a session. */
export function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development; a code works once.
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const next = safeNext(params.get("next"));
    const fail = () => router.replace("/login?error=link");
    if (!code) return fail();
    supabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => (error ? fail() : router.replace(next)), fail);
  }, [params, router]);

  return <p className="pt-12 text-center text-muted">{he.auth.verifying}</p>;
}
