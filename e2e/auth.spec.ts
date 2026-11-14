import { expect, test } from "@playwright/test";
import { requestCode, signIn, uniqueEmail } from "./helpers";

test("signed-out visitors are sent to /login and come back after the code", async ({ page }) => {
  await page.goto("/meals");
  await expect(page).toHaveURL(/\/login\?next=%2Fmeals$/);
  await expect(page.getByRole("heading", { name: "כניסה לספר המתכונים" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toHaveCount(0);

  const email = uniqueEmail("code");
  const { code, subject } = await requestCode(page, email);
  expect(subject).toBe("קוד הכניסה לספר המתכונים");

  await page.getByLabel("הקוד מהמייל (6 ספרות)").fill(code);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page).toHaveURL(/\/meals$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ארוחות");
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toBeVisible();

  // Signed in: /login bounces home.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});

test("the magic link in the same email also signs in", async ({ page }) => {
  await page.goto("/login?next=%2Fshopping");
  const { link } = await requestCode(page, uniqueEmail("link"));
  await page.goto(link);
  await expect(page).toHaveURL(/\/shopping$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("קניות");
});

test("a wrong code is refused", async ({ page }) => {
  await page.goto("/login");
  const email = uniqueEmail("wrong");
  const { code } = await requestCode(page, email);
  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("הקוד מהמייל (6 ספרות)").fill(wrong);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "הקוד שגוי או שפג תוקפו" })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("an open redirect in ?next= is ignored", async ({ page }) => {
  await page.goto("/login?next=%2F%2Fevil.example");
  const email = uniqueEmail("redirect");
  const { code } = await requestCode(page, email);
  await page.getByLabel("הקוד מהמייל (6 ספרות)").fill(code);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});

test("a broken link lands on /login with an explanation", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/login\?error=link$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "הקישור לא תקין או שפג תוקפו. אפשר לבקש קוד חדש." }),
  ).toBeVisible();
});
