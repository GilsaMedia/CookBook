import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { approve, signIn, signUp, uniqueEmail } from "./helpers";

test("Gil shares a recipe; Dana chooses it and gets a tagged copy in her own book", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const dana = uniqueEmail("dana");

  // Gil: a book with the sample recipes, then share one from its page.
  const gilPage = await (await browser.newContext()).newPage();
  const gil = await signIn(gilPage);
  execFileSync("node", ["scripts/seed-sample-book.mjs", gil], { stdio: "inherit" });
  await gilPage.goto("/");
  await gilPage
    .getByRole("list", { name: "מתכונים" })
    .getByRole("link", { name: /סלט גזר מרוקאי/ })
    .click();
  await gilPage.getByRole("link", { name: "שיתוף המתכון" }).click();
  await expect(gilPage.getByRole("button", { name: "מתכונים נבחרים (1)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await gilPage.getByRole("button", { name: "לפי כתובת מייל" }).click();
  await gilPage.getByLabel("כתובת המייל שלהם").fill(dana);
  await gilPage.getByRole("button", { name: "הוספה" }).click();
  await gilPage.getByLabel("השם שלך").fill("גיל");
  await expect(gilPage.getByText("אצלם המתכונים יופיעו עם התווית ״שותף מגיל״.")).toBeVisible();
  await gilPage.getByRole("button", { name: "שיתוף עם אדם אחד" }).click();
  await expect(gilPage.getByRole("heading", { name: "שותף!" })).toBeVisible();
  await expect(gilPage.getByText("מתכון אחד · ממתין")).toBeVisible();

  // Dana signs up later and finds it waiting.
  const danaPage = await (await browser.newContext()).newPage();
  await signIn(danaPage, dana);
  await danaPage.getByRole("link", { name: /מתכון חדש מגיל/ }).click();
  await expect(danaPage.getByRole("heading", { name: "מגיל" })).toBeVisible();
  await expect(danaPage.getByRole("checkbox", { name: "סלט גזר מרוקאי" })).toBeChecked();
  await danaPage.getByRole("button", { name: "הוספת מתכון אחד לספר שלי" }).click();
  await expect(danaPage.getByText("נוסף מתכון אחד לספר שלך, עם התווית ״שותף מגיל״.")).toBeVisible({
    timeout: 20_000,
  });

  await danaPage.getByRole("link", { name: "לספרייה" }).click();
  const card = danaPage.getByRole("list", { name: "מתכונים" }).getByRole("listitem");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("סלט גזר מרוקאי");
  await expect(card).toContainText("שותף מגיל");
  await expect(danaPage.getByRole("button", { name: /^שותף מגיל/ })).toBeVisible();
  // Nothing left waiting.
  await expect(danaPage.getByRole("link", { name: /לבחור מה להוסיף/ })).toHaveCount(0);

  // Gil sees that it was added.
  await gilPage.getByRole("button", { name: "שיתוף נוסף" }).click();
  await gilPage.reload();
  await expect(gilPage.getByText("מתכון אחד · הוסיפו 1")).toBeVisible();
});

test("sharing by link: whoever opens it first signs up and gets it", async ({ browser }) => {
  test.setTimeout(90_000);
  const gilPage = await (await browser.newContext()).newPage();
  const gil = await signIn(gilPage);
  execFileSync("node", ["scripts/seed-sample-book.mjs", gil], { stdio: "inherit" });
  await gilPage.goto("/");
  await gilPage
    .getByRole("list", { name: "מתכונים" })
    .getByRole("link", { name: /שקשוקה/ })
    .click();
  await gilPage.getByRole("link", { name: "שיתוף המתכון" }).click();
  // A link is the default: no email needed.
  await expect(gilPage.getByRole("button", { name: "שליחת קישור" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await gilPage.getByLabel("השם שלך").fill("גיל");
  await gilPage.getByRole("button", { name: "יצירת קישור" }).click();
  await expect(gilPage.getByRole("heading", { name: "הקישור מוכן" })).toBeVisible();
  const link = await gilPage.getByLabel("הקישור").inputValue();
  expect(link).toMatch(/\/shared\?t=/);
  await expect(gilPage.getByText("קישור · עוד לא נפתח")).toBeVisible();

  // Someone new opens it: signs up, waits for approval, then gets it.
  const noa = uniqueEmail("noa");
  const noaPage = await (await browser.newContext()).newPage();
  await noaPage.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(noaPage).toHaveURL(/\/login\?next=/);
  await signUp(noaPage, noa);
  await expect(noaPage.getByRole("heading", { name: "הבקשה שלך מחכה לאישור" })).toBeVisible();
  await approve(noa);
  await noaPage.getByRole("button", { name: "לבדוק שוב" }).click();
  await expect(noaPage.getByRole("checkbox", { name: "שקשוקה" })).toBeChecked();
  await noaPage.getByRole("button", { name: "הוספת מתכון אחד לספר שלי" }).click();
  await expect(noaPage.getByText("נוסף מתכון אחד לספר שלך, עם התווית ״שותף מגיל״.")).toBeVisible({
    timeout: 20_000,
  });

  // Gil sees who opened it.
  await gilPage.reload();
  await expect(gilPage.getByText(`קישור · ${noa}`)).toBeVisible();
});
