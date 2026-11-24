import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

let client: SupabaseClient<Database> | undefined;

/**
 * The one Supabase client, in the browser. The app is static (GitHub Pages),
 * so the session lives in localStorage and every query runs as the signed-in
 * user; Row-Level Security in the database decides what they can see.
 *
 * PKCE keeps magic links safe: the link's code only works in the browser
 * that asked for it. `/auth/callback` exchanges it explicitly.
 */
export function supabase(): SupabaseClient<Database> {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createClient<Database>(url, key, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
