"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isDemo } from "@/lib/demo";
import { supabase } from "@/lib/supabase/client";

/** undefined while the stored session is being read; null when signed out. */
type SessionState = Session | null | undefined;

const SessionContext = createContext<SessionState>(undefined);

/** The signed-in session, null when signed out, undefined while loading. */
export function useSession(): SessionState {
  return useContext(SessionContext);
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

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
