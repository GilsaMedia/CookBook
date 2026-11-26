import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signIn } from "./helpers";

test("a meal's shopping list: merged, by section, at home, checks that survive a change", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = await signIn(page);
  execFileSync("node", ["scripts/seed-sample-book.mjs", email], { stdio: "inherit" });
  await page.goto("/");
  for (const title of ["מרק עדשים כתומות", "סלט גזר מרוקאי", "מרק בטטה"]) {
    await page.getByRole("button", { name: `הוספה לארוחה: ${title}` }).click();
    await expect(page.getByRole("button", { name: `כבר בארוחה: ${title}` })).toBeVisible();
  }
  await page.getByRole("link", { name: /^מגש: / }).click();

  // Each dish says how much of it is at home; pantry staples already are.
  await expect(page.getByRole("button", { name: "מצרכים: מרק עדשים כתומות" })).toHaveText(
    "מצרכים (4/8 בבית)",
  );
  const potato = page.getByRole("button", { name: "מצרכים: מרק בטטה" });
  await expect(potato).toHaveText("מצרכים (0/5 בבית)");
  await potato.click();
  await page.getByRole("checkbox", { name: /בטטות/ }).check();
  await expect(potato).toHaveText("מצרכים (1/5 בבית)");

  await page.getByRole("link", { name: "יצירת רשימת קניות" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^רשימת קניות · /);
  await expect(page.getByRole("heading", { name: "ירקות ופירות" })).toBeVisible();
  const carrots = page.getByRole("checkbox", { name: /^גזר · 8 יח׳/ });
  await expect(carrots).toContainText("(מרק עדשים כתומות + סלט גזר מרוקאי)");
  await expect(page.getByRole("checkbox", { name: /^בטטה/ })).toHaveCount(0);
  // At home: the sweet potato, and the water, cumin, olive oil, salt and paprika.
  await expect(page.getByText("כבר יש בבית (6)")).toBeVisible();

  await carrots.click();
  await expect(carrots).toHaveAttribute("aria-checked", "true");

  // Take the lentil soup out: only what nothing else needs leaves the list.
  await page.getByRole("link", { name: "לארוחה" }).click();
  await page
    .getByRole("list", { name: "המנות בארוחה" })
    .getByRole("button", { name: "הסרה: מרק עדשים כתומות" })
    .click();
  await expect(page.getByRole("list", { name: "המנות בארוחה" }).getByRole("listitem")).toHaveCount(
    2,
  );
  await page.getByRole("link", { name: "יצירת רשימת קניות" }).click();
  const carrotsNow = page.getByRole("checkbox", { name: /^גזר · 6 יח׳/ });
  await expect(carrotsNow).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("checkbox", { name: /^עדשים כתומות/ })).toHaveCount(0);

  // Unchecking offers "בטל".
  await carrotsNow.click();
  await expect(page.getByRole("status")).toContainText("״גזר״ חזר לרשימה");
});
