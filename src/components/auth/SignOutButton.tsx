"use client";

import { useRouter } from "next/navigation";
import { he } from "@/i18n/he";
import { supabase } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await supabase().auth.signOut();
        router.replace("/login");
      }}
      className="press h-11 px-2 text-sm font-medium text-muted"
    >
      {he.auth.signOut}
    </button>
  );
}
