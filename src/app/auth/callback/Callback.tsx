"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { he } from "@/i18n/he";
import { safeNext } from "@/lib/auth/redirect";
import { supabase } from "@/lib/supabase/client";

/**
 * Where email links land (verifying the address at sign-up, resetting a
 * password). The link carries the session in its #fragment; the Supabase
 * client reads it when it starts, so this page only waits for that and
 * moves on. A used or expired link comes back with an error instead.
 */
export function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = safeNext(params.get("next"));
    const fail = () => router.replace("/login?error=link");
    supabase()
      .auth.getSession()
      .then(({ data }) => (data.session ? router.replace(next) : fail()), fail);
  }, [params, router]);

  return <p className="pt-12 text-center text-muted">{he.auth.working}</p>;
}
