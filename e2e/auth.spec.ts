import { expect, test } from "@playwright/test";
import { fillSignIn, PASSWORD, readEmail, signIn, signUp, uniqueEmail } from "./helpers";

test("signed-out visitors are sent to /login and come back after signing up", async ({ page }) => {
  await page.goto("/meals");
  await expect(page).toHaveURL(/\/login\?next=%2Fmeals$/);
  await expect(page.getByRole("heading", { name: "כניסה לספר המתכונים" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toHaveCount(0);

  await signUp(page, uniqueEmail("signup"));
  await expect(page).toHaveURL(/\/meals$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ארוחות");
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toBeVisible();

  // Signed in: /login bounces home.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});

test("signing out, then back in with the password", async ({ page }) => {
  const email = await signIn(page);
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/shopping");
  await expect(page).toHaveURL(/\/login\?next=%2Fshopping$/);

  await fillSignIn(page, email);
  await expect(page).toHaveURL(/\/shopping$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("קניות");
});

test("a wrong password is refused", async ({ page }) => {
  const email = await signIn(page);
  await page.getByRole("button", { name: "יציאה" }).click();
  await fillSignIn(page, email, "not-the-password");
  await expect(
    page.getByRole("alert").filter({ hasText: "המייל או הסיסמה לא נכונים" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("a short password is refused before anything is sent", async ({ page }) => {
  await page.goto("/login");
  await signUp(page, uniqueEmail("short"), "1234567");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "פתיחת חשבון", exact: true })).toBeVisible();
});

test("signing up twice with the same email says the account exists", async ({ page }) => {
  const email = await signIn(page);
  await page.getByRole("button", { name: "יציאה" }).click();
  await signUp(page, email);
  await expect(
    page.getByRole("alert").filter({ hasText: "כבר יש חשבון עם המייל הזה" }),
  ).toBeVisible();
});

test("a forgotten password is reset through the emailed link", async ({ page }) => {
  const email = await signIn(page);
  await page.getByRole("button", { name: "יציאה" }).click();

  await page.getByRole("button", { name: "שכחתי סיסמה" }).click();
  await page.getByLabel("כתובת מייל").fill(email);
  await page.getByRole("button", { name: "שליחת קישור" }).click();
  await expect(page.getByText(`שלחנו קישור לאיפוס אל ${email}`)).toBeVisible();

  const { link, subject } = await readEmail(email);
  expect(subject).toBe("איפוס הסיסמה לספר המתכונים");
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/reset$/);
  await page.getByLabel("סיסמה (לפחות 8 תווים)").fill("a-brand-new-one");
  await page.getByRole("button", { name: "שמירת הסיסמה" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "יציאה" }).click();
  await fillSignIn(page, email, PASSWORD);
  await expect(page.getByRole("alert")).toBeVisible();
  await fillSignIn(page, email, "a-brand-new-one");
  await expect(page).toHaveURL(/\/$/);
});

test("an open redirect in ?next= is ignored", async ({ page }) => {
  await page.goto("/login?next=%2F%2Fevil.example");
  await signUp(page, uniqueEmail("redirect"));
  await expect(page).toHaveURL("http://localhost:3100/");
});

test("a broken link lands on /login with an explanation", async ({ page }) => {
  await page.goto("/auth/callback#error=access_denied&error_code=otp_expired");
  await expect(page).toHaveURL(/\/login\?error=link$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "הקישור לא תקין או שפג תוקפו. אפשר לבקש חדש." }),
  ).toBeVisible();
});
