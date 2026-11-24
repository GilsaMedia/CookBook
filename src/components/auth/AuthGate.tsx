"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isPublicPath } from "@/lib/auth/redirect";
import { isDemo } from "@/lib/demo";
import { useSession } from "./AuthProvider";

/**
 * Keeps signed-out visitors on /login and sends them back afterwards.
 * This is navigation only: the database's RLS is what protects the data,
 * so a visitor who skips this gate still gets nothing.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const open = isDemo || isPublicPath(pathname);

  useEffect(() => {
    if (open || session !== null) return;
    const here = pathname + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(here)}`);
  }, [open, session, pathname, router]);

  if (open || session) return children;
  return null;
}
