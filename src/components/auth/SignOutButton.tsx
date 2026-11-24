"use client";

import { he } from "@/i18n/he";
import { supabase } from "@/lib/supabase/client";

export function SignOutButton() {
  return (
    <button
      type="button"
      // AuthGate sees the session end and moves to /login.
      onClick={() => supabase().auth.signOut()}
      className="press h-11 px-2 text-sm font-medium text-muted"
    >
      {he.auth.signOut}
    </button>
  );
}
