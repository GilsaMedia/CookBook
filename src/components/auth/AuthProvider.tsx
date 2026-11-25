"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMyAccess, type Access } from "@/lib/data/access";
import { isDemo } from "@/lib/demo";
import { supabase } from "@/lib/supabase/client";

/** undefined while the stored session is being read; null when signed out. */
type SessionState = Session | null | undefined;

const SessionContext = createContext<SessionState>(undefined);

/** undefined while it loads; null when signed out (or in the demo). */
type AccessState = (Access & { refresh: () => void }) | null | undefined;
const AccessContext = createContext<AccessState>(undefined);

/** The signed-in session, null when signed out, undefined while loading. */
export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** Whether the account is approved yet, and whether it's an admin's. */
export function useAccess(): AccessState {
  return useContext(AccessContext);
}

/** Tracks the Supabase session for the whole app. The demo build has none. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(isDemo ? null : undefined);

  useEffect(() => {
    if (isDemo) return;
    const auth = supabase().auth;
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const [access, setAccess] = useState<{ for: string; value: Access } | null>(null);
  const [check, setCheck] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    getMyAccess().then(
      (value) => live && setAccess({ for: userId, value }),
      // Can't tell: treat as approved; the database still enforces it.
      () => live && setAccess({ for: userId, value: { status: "approved", isAdmin: false } }),
    );
    return () => {
      live = false;
    };
  }, [userId, check]);

  const accessState: AccessState = !session
    ? session === null || isDemo
      ? null
      : undefined
    : access && access.for === userId
      ? { ...access.value, refresh: () => setCheck((n) => n + 1) }
      : undefined;

  return (
    <SessionContext.Provider value={session}>
      <AccessContext.Provider value={accessState}>{children}</AccessContext.Provider>
    </SessionContext.Provider>
  );
}
