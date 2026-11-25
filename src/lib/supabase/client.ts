import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

let client: SupabaseClient<Database> | undefined;

/**
 * The one Supabase client, in the browser. The app is static (GitHub Pages),
 * so the session lives in localStorage and every query runs as the signed-in
 * user; Row-Level Security in the database decides what they can see.
 *
 * Sign-in is email + password. Email links (verifying the address once at
 * sign-up, resetting a password) use the implicit flow: the link carries the
 * session itself, so it works whichever browser opens it (Gmail's in-app
 * browser, a new tab), unlike PKCE, which needs the browser that asked.
 */
export function supabase(): SupabaseClient<Database> {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createClient<Database>(url, key, {
      auth: {
        flowType: "implicit",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
