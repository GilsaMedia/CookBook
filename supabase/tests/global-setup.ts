import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

export type LocalSupabase = { url: string; anonKey: string; serviceRoleKey: string };

declare module "vitest" {
  export interface ProvidedContext {
    supabase: LocalSupabase;
  }
}

// Reads the local stack's URL and keys from the Supabase CLI, so no keys
// are ever written into the repo.
export default function setup(project: TestProject) {
  let status: Record<string, string>;
  try {
    const out = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    status = JSON.parse(out.slice(out.indexOf("{")));
  } catch {
    throw new Error("Local Supabase is not running. Start it with `npx supabase start`.");
  }
  project.provide("supabase", {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  });
}
