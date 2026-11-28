import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fillSignIn, signIn } from "./helpers";

/** Where the ingredients sheet is: its vertical offset in px (0 = open). */
const sheetY = (page: Page) =>
  page.locator("[data-open]").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);

test("cook mode follows the cook from the phone to a second screen, and back", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const phone = await (await browser.newContext()).newPage();
  const email = await signIn(phone);
  execFileSync("node", ["scripts/seed-sample-book.mjs", email], { stdio: "inherit" });

  await phone.goto("/");
  await phone
    .getByRole("list", { name: "מתכונים" })
    .getByRole("link", { name: /שקשוקה/ })
    .click();
  await phone.getByRole("link", { name: "מצב בישול" }).click();
  await expect(phone).toHaveURL(/\/cook\?id=/);
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(/^שלב 1 מתוך \d+ · שקשוקה$/);
  await expect(phone.getByRole("navigation", { name: "ניווט ראשי" })).toBeHidden();
  const cookUrl = phone.url().replace(/^https?:\/\/[^/]+/, "");

  // The same cook opens it on a second screen.
  const tablet = await (await browser.newContext()).newPage();
  await tablet.goto("/login");
  await fillSignIn(tablet, email);
  await expect(tablet.getByRole("navigation", { name: "ניווט ראשי" })).toBeVisible();
  await tablet.goto(cookUrl);
  await expect(phone.locator("[data-live]")).toHaveAttribute("data-live", "true");
  await expect(tablet.locator("[data-live]")).toHaveAttribute("data-live", "true");

  // A check on the phone shows on the other screen within a second.
  const first = phone.getByRole("checkbox").first();
  const name = (await first.textContent())!.replace(/רשות$/, "").trim();
  await first.click();
  await expect(first).toHaveAttribute("aria-checked", "true");
  await expect(tablet.getByRole("checkbox", { name: new RegExp(`^${name}`) })).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 1_000 },
  );
  await expect(tablet.getByRole("button", { name: /^מצרכים 1\/\d+$/ })).toBeVisible();

  // The step moves on the other screen; the phone follows.
  await tablet.getByRole("button", { name: "השלב הבא" }).click();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(/^שלב 2 מתוך/, {
    timeout: 1_000,
  });

  // Reopening offers to continue; continuing picks up where it was.
  await phone.reload();
  await expect(phone.getByRole("dialog", { name: "כבר התחלת לבשל את זה" })).toContainText(
    "שלב 2 מתוך",
  );
  await phone.getByRole("button", { name: "להמשיך" }).click();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(/^שלב 2 מתוך/);
  await expect(phone.getByRole("button", { name: /^מצרכים 1\/\d+$/ })).toBeVisible();

  // Starting over on one screen starts over on the other too.
  await tablet.reload();
  await tablet.getByRole("button", { name: "להתחיל מחדש" }).click();
  await expect(tablet.getByRole("heading", { level: 1 })).toHaveText(/^שלב 1 מתוך/);
  await expect(phone.locator("[data-live]")).toHaveAttribute("data-live", "true");
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(/^שלב 1 מתוך/);
  await expect(phone.getByRole("button", { name: /^מצרכים 0\/\d+$/ })).toBeVisible();

  // The sheet: tapping the handle opens it; caught mid-way, it stays under the finger.
  const caught = await phone.evaluate(async () => {
    const sheet = document.querySelector<HTMLElement>("[data-open]")!;
    const handle = sheet.querySelector("button")!;
    const y = () => new DOMMatrix(getComputedStyle(sheet).transform).m42;
    const closed = y();
    handle.click();
    await new Promise((r) => setTimeout(r, 80));
    const box = handle.getBoundingClientRect();
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    const grabbedAt = y();
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...at,
        bubbles: true,
        pointerId: 7,
        isPrimary: true,
        button: 0,
        buttons: 1,
        pointerType: "touch",
      }),
    );
    await new Promise((r) => setTimeout(r, 300));
    const held = y();
    window.dispatchEvent(
      new PointerEvent("pointerup", { ...at, bubbles: true, pointerId: 7, pointerType: "touch" }),
    );
    return { closed, grabbedAt, held };
  });
  expect(caught.grabbedAt).toBeGreaterThan(0);
  expect(caught.grabbedAt).toBeLessThan(caught.closed);
  // A spring left alone would have reached 0 (open) well within 300ms.
  expect(Math.abs(caught.held - caught.grabbedAt)).toBeLessThan(60);
  expect(caught.held).toBeGreaterThan(10);

  // Opened by its handle, the sheet lists everything.
  await phone.reload();
  await phone.getByRole("button", { name: /^מצרכים 0\/\d+$/ }).click();
  await expect(phone.locator("[data-open]")).toHaveAttribute("data-open", "true");
  await expect.poll(() => sheetY(phone)).toBe(0);

  // Done: the session ends, so next time starts fresh.
  while (await phone.getByRole("button", { name: "השלב הבא" }).isVisible())
    await phone.getByRole("button", { name: "השלב הבא" }).click();
  await phone.getByRole("button", { name: "סיימתי" }).click();
  await expect(phone).toHaveURL(/\/recipe\?id=/);
  await phone.getByRole("link", { name: "מצב בישול" }).click();
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText(/^שלב 1 מתוך/);
  await expect(phone.getByRole("dialog")).toBeHidden();
});
