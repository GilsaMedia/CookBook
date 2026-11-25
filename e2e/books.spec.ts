import { expect, test, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { admin, signIn, uniqueEmail, userId } from "./helpers";

async function gilWithSampleBook(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  const email = await signIn(page);
  execFileSync("node", ["scripts/seed-sample-book.mjs", email], { stdio: "inherit" });
  await page.goto("/");
  return { page, email };
}

async function shareWholeBook(
  page: Awaited<ReturnType<typeof gilWithSampleBook>>["page"],
  to: string,
  join = false,
) {
  await page.getByRole("link", { name: "שיתוף", exact: true }).click();
  await expect(page.getByRole("button", { name: "כל הספר (8)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (join) await page.getByLabel(/לצרף אותם לספר עצמו/).check();
  await page.getByLabel("כתובת המייל שלהם").fill(to);
  await page.getByLabel("השם שלך").fill("גיל");
  await page.getByRole("button", { name: "שיתוף עם אדם אחד" }).click();
  await expect(page.getByRole("heading", { name: "שותף!" })).toBeVisible();
}

test("open a second book, switch between books", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /החלפת ספר/ }).click();
  await page.getByRole("button", { name: "+ ספר חדש" }).click();
  await page.getByLabel("שם הספר החדש").fill("ספר הקינוחים");
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ספר הקינוחים");

  await page.getByRole("button", { name: /החלפת ספר/ }).click();
  await page.getByRole("button", { name: /^ספר המתכונים/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ספר המתכונים");
});

test("a whole book taken whole keeps getting the recipes added later", async ({ browser }) => {
  test.setTimeout(90_000);
  const gil = await gilWithSampleBook(browser);
  const dana = uniqueEmail("dana");
  await shareWholeBook(gil.page, dana);

  const danaPage = await (await browser.newContext()).newPage();
  await signIn(danaPage, dana);
  await danaPage.getByRole("link", { name: /לבחור מה להוסיף/ }).click();
  await expect(
    danaPage.getByText("בחרת את כל הספר: כל מתכון שיתווסף אליו יגיע גם לספר שלך."),
  ).toBeVisible();
  await danaPage.getByRole("button", { name: "הוספת 8 מתכונים לספר שלי" }).click();
  await expect(danaPage.getByText(/נוספו 8 מתכונים לספר שלך/)).toBeVisible({ timeout: 30_000 });
  await gil.page.reload();
  await expect(gil.page.getByText("כל הספר · הוסיפו 8 · מתעדכן אוטומטית")).toBeVisible();

  // Gil adds a recipe; Dana's next visit brings it in.
  const { data: book } = await admin()
    .from("book_members")
    .select("book_id")
    .eq("user_id", await userId(gil.email))
    .eq("role", "owner")
    .single();
  await admin()
    .from("recipes")
    .insert({ book_id: book!.book_id, title: "עוגת הדבש של סבתא", status: "approved" });
  await danaPage.goto("/");
  await expect(danaPage.getByText("נוסף מתכון חדש מגיל")).toBeVisible();
  await expect(danaPage.getByRole("main").getByRole("listitem")).toHaveCount(9);
  await expect(danaPage.getByRole("link", { name: /עוגת הדבש של סבתא/ })).toContainText(
    "שותף מגיל",
  );
});

test("an invitation into the book: it's in their switcher, live", async ({ browser }) => {
  test.setTimeout(90_000);
  const gil = await gilWithSampleBook(browser);
  await admin()
    .from("books")
    .update({ name: "המתכונים של גיל" })
    .eq(
      "id",
      (
        await admin()
          .from("book_members")
          .select("book_id")
          .eq("user_id", await userId(gil.email))
          .eq("role", "owner")
          .single()
      ).data!.book_id,
    );
  const noa = uniqueEmail("noa");
  await shareWholeBook(gil.page, noa, true);

  const noaPage = await (await browser.newContext()).newPage();
  await signIn(noaPage, noa);
  await noaPage.getByRole("link", { name: /לבחור מה להוסיף/ }).click();
  await expect(
    noaPage.getByRole("heading", { name: "גיל מזמין/ה אותך לספר המתכונים שלו/ה" }),
  ).toBeVisible();
  await noaPage.getByRole("button", { name: "הצטרפות לספר" }).click();
  await noaPage.getByRole("button", { name: "לספר", exact: true }).click();
  await expect(noaPage.getByRole("heading", { level: 1 })).toHaveText("המתכונים של גיל");
  await expect(noaPage.getByRole("main").getByRole("listitem")).toHaveCount(8);

  // Gil sees Noa in the book and can take her out.
  await gil.page.reload();
  await expect(gil.page.getByRole("heading", { name: "אנשים בספר הזה" })).toBeVisible();
  const member = gil.page
    .getByRole("listitem")
    .filter({ has: gil.page.getByRole("button", { name: "הוצאה מהספר" }) });
  await expect(member).toContainText(noa);
});
