import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signIn } from "./helpers";

/** Signs in a fresh user and fills their book with the 8 sample recipes. */
async function signInWithSampleBook(page: Parameters<typeof signIn>[0]) {
  const email = await signIn(page);
  // The seed script is plain ESM; run it rather than importing it into Playwright.
  execFileSync("node", ["scripts/seed-sample-book.mjs", email], { stdio: "inherit" });
  await page.goto("/");
}

test("library → filter a category → recipe page with a safe source link", async ({ page }) => {
  await signInWithSampleBook(page);
  const cards = page.getByRole("list", { name: "מתכונים" }).getByRole("listitem");
  await expect(cards).toHaveCount(8);

  // Tapping a chip filters; tapping it again clears.
  const salads = page.getByRole("button", { name: /^סלטים/ });
  await salads.click();
  await expect(salads).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(1);
  await salads.click();
  await expect(cards).toHaveCount(8);
  await salads.click();

  await page.getByRole("link", { name: /סלט גזר מרוקאי/ }).click();
  await expect(page).toHaveURL(/\/recipe\?id=[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("סלט גזר מרוקאי");
  const source = page.getByRole("link", { name: /מתכון לדוגמה/ });
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", /noopener/);
  await expect(page.getByRole("heading", { name: "מצרכים" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "אופן ההכנה" })).toBeVisible();
});

test("searching the plural finds the singular ingredient", async ({ page }) => {
  await signInWithSampleBook(page);
  await page.getByRole("searchbox").fill("גזרים");
  const titles = page
    .getByRole("list", { name: "מתכונים" })
    .getByRole("listitem")
    .getByRole("heading");
  await expect(titles).toHaveText(["מרק עדשים כתומות", "סלט גזר מרוקאי"]);
});

test("excluded ingredients show a warning, and nothing scrolls sideways at 360px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signInWithSampleBook(page);
  await expect(page.getByText("מכיל הל")).toBeVisible();

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBe(0);
  await page.getByRole("link", { name: /עוגת תפוזים/ }).click();
  await expect(page.getByText("מכיל הל")).toBeVisible();
  expect(await overflow()).toBe(0);
});
