import { expect, test } from "@playwright/test";

test("app shell renders RTL Hebrew with four bottom tabs", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "he");
  await expect(html).toHaveAttribute("dir", "rtl");

  const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(nav.getByRole("link")).toHaveText(["ספרייה", "ארוחות", "קניות", "הוספה"]);
  await expect(nav.getByRole("link", { name: "ספרייה" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "קניות" }).click();
  await expect(page).toHaveURL(/\/shopping$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("קניות");
  await expect(nav.getByRole("link", { name: "קניות" })).toHaveAttribute("aria-current", "page");
});

test("manifest and service worker are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "ספר המתכונים", dir: "rtl", display: "standalone" });

  const sw = await request.get("/serwist/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["content-type"]).toContain("javascript");
});
