import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Local Supabase captures outgoing email in Mailpit.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const uniqueEmail = (label = "e2e") => `${label}-${randomUUID().slice(0, 8)}@test.local`;
export const PASSWORD = "kitchen-secret-42";

/** Waits for the newest email to `email` and returns its link and subject. */
export async function readEmail(email: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    ).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const link = (message.HTML as string)
        .match(/href="([^"]+\/auth\/v1\/verify[^"]+)"/)?.[1]
        ?.replaceAll("&amp;", "&");
      if (link) return { link, subject: message.Subject as string };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email arrived for ${email}`);
}

/** Opens an account on /login (already open). Local sign-ups skip verification. */
export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.getByRole("button", { name: "אין לך חשבון? פתיחת חשבון" }).click();
  await page.getByLabel("כתובת מייל").fill(email);
  await page.getByLabel("סיסמה (לפחות 8 תווים)").fill(password);
  await page.getByRole("button", { name: "פתיחת חשבון", exact: true }).click();
}

/** Signs in on /login (already open) with email and password. */
export async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("כתובת מייל").fill(email);
  await page.getByLabel("סיסמה", { exact: true }).fill(password);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
}

let adminClient: SupabaseClient | null = null;

/** Service-role client for the local Supabase: arranges what an admin would. */
export function admin(): SupabaseClient {
  if (!adminClient) {
    const out = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" });
    const status = JSON.parse(out.slice(out.indexOf("{")));
    adminClient = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export async function userId(email: string): Promise<string> {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)!.id;
}

/** Approves a new account, as the app's admin would on /requests. */
export async function approve(email: string) {
  const { error } = await admin()
    .from("profiles")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", await userId(email));
  if (error) throw error;
}

/** A new account, signed in through the real UI and approved. */
export async function signIn(page: Page, email = uniqueEmail()) {
  await page.goto("/login");
  await signUp(page, email);
  await expect(page.getByRole("heading", { name: "הבקשה שלך מחכה לאישור" })).toBeVisible();
  await approve(email);
  await page.getByRole("button", { name: "לבדוק שוב" }).click();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  return email;
}
