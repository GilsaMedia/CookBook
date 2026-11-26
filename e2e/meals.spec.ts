import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signIn } from "./helpers";

test("six dishes → a Friday meal → swap one → undo a removal", async ({ page }) => {
  test.setTimeout(90_000);
  const email = await signIn(page);
  execFileSync("node", ["scripts/seed-sample-book.mjs", email], { stdio: "inherit" });
  await page.goto("/");

  // Six dishes onto the tray, from the library cards.
  const add = page.getByRole("button", { name: /^הוספה לארוחה: / });
  await expect(add).toHaveCount(8);
  for (let i = 0; i < 6; i++) {
    await add.nth(i).click();
    await expect(add.nth(i)).toHaveText("✓");
  }
  // The first dish opened the active meal, for the coming Friday.
  const pill = page.getByRole("link", { name: /^מגש: יום שישי \d{1,2}\/\d{1,2}\/\d{4} · 6$/ });
  await expect(pill).toBeVisible();

  // The tray is on the server: still there after a reload.
  await page.reload();
  await expect(pill).toBeVisible();

  await pill.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^מגש הארוחה: יום שישי \d{1,2}\/\d{1,2}\/\d{4}$/,
  );
  const dishes = page.getByRole("list", { name: "המנות בארוחה" }).getByRole("listitem");
  await expect(dishes).toHaveCount(6);

  // Swap: the library opens to pick another dish for the same place.
  // Swap is in the dish's "מצרכים" panel, with its servings.
  await page.getByRole("button", { name: "מצרכים: מרק בטטה" }).click();
  await page.getByRole("link", { name: "החלפה: מרק בטטה" }).click();
  await expect(page.getByText("בחירת מנה · במקום ״מרק בטטה״")).toBeVisible();
  await page.getByRole("button", { name: /שקשוקה/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^מגש הארוחה: יום שישי/);
  await expect(dishes).toHaveCount(6);
  await expect(dishes.first()).toContainText("שקשוקה");
  await expect(page.getByRole("main")).not.toContainText("מרק בטטה");

  // Remove, then undo within the 5 seconds.
  await page.getByRole("button", { name: "הסרה: שקשוקה" }).click();
  await expect(dishes).toHaveCount(5);
  await expect(page.getByRole("status")).toContainText("״שקשוקה״ הוסרה");
  await page.getByRole("button", { name: "בטל" }).click();
  await expect(dishes).toHaveCount(6);
  await page.reload();
  await expect(dishes).toHaveCount(6);
  await expect(dishes.first()).toContainText("שקשוקה");

  // Who opened it, and each dish's ingredients on demand.
  await expect(page.getByText(/^נפתחה על ידי /)).toBeVisible();
  const ingredients = page.getByRole("button", { name: "מצרכים: שקשוקה" });
  await ingredients.click();
  await expect(ingredients).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "עוד מנה: שקשוקה" })).toBeVisible();

  // Each course lists the meal's dishes in it.
  const menu = page.getByRole("region", { name: "השלמת התפריט ✨" });
  await expect(menu.getByRole("link", { name: "מרק עדשים כתומות" })).toBeVisible();

  // Not built yet, and says so.
  await expect(page.getByRole("button", { name: "יצירת רשימת קניות · בקרוב" })).toBeDisabled();

  // The meal page: every dish in full.
  await page.getByRole("link", { name: "דף ארוחה" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(6);

  // Opening another meal: it becomes the active one; this one joins the list.
  await page.goto("/meals");
  await expect(page.getByRole("heading", { name: /^ארוחה פעילה/ })).toBeVisible();
  await page.getByLabel("שם הארוחה").fill("שישי אצל סבתא");
  await page.getByRole("button", { name: "פתיחת ארוחה" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^מגש הארוחה: שישי אצל סבתא \d/);
  await page.goto("/meals");
  await expect(page.getByRole("heading", { name: "ארוחות קרובות" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^יום שישי \d.*6 מנות/ })).toBeVisible();

  // Any meal can be deleted, with one "are you sure?" tap.
  await page.getByRole("button", { name: /^מחיקת יום שישי \d/ }).click();
  await page.getByRole("button", { name: "למחוק? כן" }).click();
  await expect(page.getByRole("link", { name: /^יום שישי \d.*6 מנות/ })).toHaveCount(0);

  // The library's home shows the family's meals and the newest recipes.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "הארוחות של המשפחה" })).toBeVisible();
  await expect(page.getByRole("link", { name: /שישי אצל סבתא \d/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "נוספו לאחרונה ✨" })).toBeVisible();
});
