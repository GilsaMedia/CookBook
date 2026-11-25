import { expect, test } from "@playwright/test";
import {
  admin,
  approve,
  fillSignIn,
  PASSWORD,
  readEmail,
  signIn,
  signUp,
  uniqueEmail,
  userId,
} from "./helpers";

test("signed-out visitors are sent to /login and come back after signing up", async ({ page }) => {
  await page.goto("/meals");
  await expect(page).toHaveURL(/\/login\?next=%2Fmeals$/);
  await expect(page.getByRole("heading", { name: "כניסה לספר המתכונים" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toHaveCount(0);

  const email = uniqueEmail("signup");
  await signUp(page, email);
  // A new account waits for approval, and sees nothing of the app.
  await expect(page.getByRole("heading", { name: "הבקשה שלך מחכה לאישור" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toHaveCount(0);
  await approve(email);
  await page.getByRole("button", { name: "לבדוק שוב" }).click();
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

test("the admin approves a new account on the requests page", async ({ browser }) => {
  const boss = await (await browser.newContext()).newPage();
  const bossEmail = await signIn(boss);
  await admin()
    .from("app_admins")
    .insert({ user_id: await userId(bossEmail) });

  const newcomer = await (await browser.newContext()).newPage();
  const email = uniqueEmail("newcomer");
  await newcomer.goto("/login");
  await signUp(newcomer, email);
  await newcomer.getByLabel("איך קוראים לך? (כדי שידעו מי מבקש)").fill("דנה");
  await newcomer.getByRole("button", { name: "שמירה" }).click();
  await expect(newcomer.getByText("נשמר.")).toBeVisible();

  await boss.reload();
  await boss.getByRole("link", { name: /^בקשות \(\d+\)$/ }).click();
  const request = boss.getByRole("listitem").filter({ hasText: email });
  await expect(request).toContainText("דנה");
  await request.getByRole("button", { name: "אישור" }).click();
  await expect(request).toContainText("אושר/ה");

  await newcomer.getByRole("button", { name: "לבדוק שוב" }).click();
  await expect(newcomer.getByRole("navigation", { name: "ניווט ראשי" })).toBeVisible();
});

test("only admins see the requests page", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("link", { name: /^בקשות/ })).toHaveCount(0);
  await page.goto("/requests");
  await expect(page.getByText("הדף הזה זמין רק למנהלי האפליקציה.")).toBeVisible();
});
