import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// Local Supabase captures outgoing email in Mailpit.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const uniqueEmail = (label = "e2e") => `${label}-${randomUUID().slice(0, 8)}@test.local`;

/** Waits for the newest sign-in email to `email` and returns its code and link. */
export async function readSignInEmail(email: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    ).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const html: string = message.HTML;
      const code = html.match(/\b(\d{6})\b/)?.[1];
      const link = html
        .match(/href="([^"]+\/auth\/v1\/verify[^"]+)"/)?.[1]
        ?.replaceAll("&amp;", "&");
      if (code && link) return { code, link, subject: message.Subject as string };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in email arrived for ${email}`);
}

/** Requests a code on /login (already open) and returns the email's contents. */
export async function requestCode(page: Page, email: string) {
  await page.getByLabel("כתובת מייל").fill(email);
  await page.getByRole("button", { name: "שליחת קוד" }).click();
  await expect(page.getByText(`שלחנו קוד אל ${email}`)).toBeVisible();
  return readSignInEmail(email);
}

/** Signs in through the real UI with the emailed 6-digit code. */
export async function signIn(page: Page, email = uniqueEmail()) {
  await page.goto("/login");
  const { code } = await requestCode(page, email);
  await page.getByLabel("הקוד מהמייל (6 ספרות)").fill(code);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  return email;
}
