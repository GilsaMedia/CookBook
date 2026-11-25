"use client";

import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { isPublicPath } from "@/lib/auth/redirect";
import { isDemo } from "@/lib/demo";
import { useAccess, useSession } from "./AuthProvider";
import { PendingScreen } from "./PendingScreen";

/**
 * Keeps signed-out visitors on /login and sends them back afterwards, and
 * shows a new account the waiting screen until an admin approves it.
 * This is navigation only: the database's RLS is what protects the data,
 * so a visitor who skips this gate still gets nothing.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const access = useAccess();
  const pathname = usePathname();
  const router = useRouter();
  const open = isDemo || isPublicPath(pathname);
  const previous = useRef<Session | null | undefined>(undefined);

  useEffect(() => {
    const was = previous.current;
    previous.current = session;
    if (session !== null) return;
    // Signing out (here or in another tab) goes to a plain /login: there's
    // nothing to come back to.
    if (was) return router.replace("/login");
    if (open) return;
    const here = pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [open, session, pathname, router]);

  if (open) return children;
  if (!session || !access) return null;
  if (access.status !== "approved")
    return <PendingScreen status={access.status} onCheck={access.refresh} />;
  return children;
}
