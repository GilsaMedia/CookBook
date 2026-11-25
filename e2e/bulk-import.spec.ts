import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { sampleDocx } from "../src/lib/import/fixture-docx";
import { signIn } from "./helpers";

// The AI server and the scheduled worker don't run in CI, so this test
// plays the worker through the same service-role queue functions, with
// canned AI results. Everything the owner sees and saves runs for real.

const status = JSON.parse(
  (() => {
    const out = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" });
    return out.slice(out.indexOf("{"));
  })(),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const recipe = (title: string, ingredients: string[]) => ({
  is_recipe: true,
  title,
  servings: 4,
  prep_time: 20,
  cook_time: 60,
  dish_role: "main",
  uses_oven: true,
  oven_temp: 160,
  uses_stovetop: false,
  make_ahead: false,
  cuisine: null,
  source_language: "he",
  ingredients: ingredients.map((name) => ({
    display_text: name,
    quantity: null,
    unit: null,
    canonical_name: name,
    section: "produce",
    optional: false,
  })),
  steps: ["אופים בתנור על 160 מעלות שעה."],
  confidence: { title: 0.9, ingredients: 0.9, steps: 0.9, times: 0.9 },
});

/** Does the worker's job for every queued item: links fail, recipes come back. */
async function actAsWorker(expected: number) {
  let handled = 0;
  for (let tries = 0; handled < expected && tries < 40; tries++) {
    const { data } = await admin.rpc("claim_import_items", { p_limit: 10 });
    for (const item of data ?? []) {
      const title = (item.entry as { title: string }).title;
      if (item.task === "import_url") {
        await admin.rpc("finish_import_item", {
          p_id: item.id,
          p_status: "failed",
          p_result: null,
          p_error: "fetch_failed",
        });
      } else {
        const ingredients = title.startsWith("מוסקה")
          ? ["חציל", "בשר טחון", "עגבנייה", "בצל"] // the same recipe twice in the file
          : ["עדשים כתומות", "בצל", "גזר"];
        await admin.rpc("finish_import_item", {
          p_id: item.id,
          p_status: "done",
          p_result: { recipe: recipe(title, ingredients), source: null },
          p_error: "",
        });
      }
      handled++;
    }
    if (handled < expected) await new Promise((r) => setTimeout(r, 500));
  }
  expect(handled).toBe(expected);
}

async function uploadSample(page: Page) {
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cookbook.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(sampleDocx()),
  });
}

test("a whole Word cookbook: map, import in the background, review duplicates, save; then re-import", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signIn(page);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
  const { data: m } = await admin
    .from("book_members")
    .select("book_id")
    .eq("user_id", userId)
    .single();
  await admin.from("ai_access").insert({ book_id: m!.book_id });

  await uploadSample(page);
  await expect(page.getByText("נמצאו 3 מתכונים, 1 קישורים לייבוא, 1 ריקים.")).toBeVisible();
  // Headings that match the book's categories go there.
  await expect(page.getByLabel("מרקים", { exact: true })).toHaveValue("מרקים");
  await expect(page.getByLabel("מנות עיקריות – בשר ועוף")).toHaveValue("מנות עיקריות – בשר ועוף");
  await expect(page.getByText("ריק — למחוק?")).toBeVisible();
  await expect(page.getByText("פולנטה של מחניודה")).toBeVisible();

  await page.getByRole("button", { name: "התחלת ייבוא (4)" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await actAsWorker(4);

  await expect(page.getByRole("heading", { name: "בדיקת הייבוא" })).toBeVisible({
    timeout: 20_000,
  });
  const group = page
    .getByRole("listitem")
    .filter({ hasText: "מוסקה של קורין" })
    .filter({ hasText: "מוסקה – קורין" });
  await expect(group.getByRole("button", { name: "מיזוג" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("לא הצלחנו לקרוא · 1")).toBeVisible();

  // Try the one that failed again: it goes back through the queue alone.
  await page.getByRole("button", { name: "לנסות שוב (1)" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await actAsWorker(1);
  await expect(page.getByRole("heading", { name: "בדיקת הייבוא" })).toBeVisible({
    timeout: 20_000,
  });
  // Still unreadable: by default it's saved as written, so nothing is lost.
  await expect(page.getByText("לא הצלחנו לקרוא · 1")).toBeVisible();
  await expect(page.getByLabel("לשמור אותם כמו שהם כתובים, בלי סידור")).toBeChecked();
  await page.getByRole("button", { name: "שמירת 3 מתכונים" }).click();
  await expect(page.getByText("נשמרו 3 מתכונים.")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "לספרייה" }).click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  await page.getByRole("link", { name: /מוסקה/ }).click();
  await expect(page.getByText("אופים בתנור על 160 מעלות שעה.")).toBeVisible();

  // The same file again: everything is already in the book.
  await uploadSample(page);
  await page.getByRole("button", { name: "התחלת ייבוא (4)" }).click();
  await actAsWorker(4);
  await expect(page.getByRole("heading", { name: "בדיקת הייבוא" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("כבר בספר").first()).toBeVisible();
  await page.getByRole("button", { name: "דילוג על כל הכפילויות" }).click();
  await page.getByLabel("לשמור אותם כמו שהם כתובים, בלי סידור").uncheck();
  await expect(page.getByRole("button", { name: "שמירת 0 מתכונים" })).toBeDisabled();
});

test("a Hebrew PDF is read in the browser and Claude's recipe list builds the mapping", async ({
  page,
  browser,
}) => {
  // Print a small Hebrew cookbook to PDF (as Google Docs would export it).
  const printer = await browser.newPage();
  await printer.setContent(`<html dir="rtl" lang="he"><body style="font-family: Arial">
    <h1>מרקים</h1><h2>מרק עדשים</h2><ul><li>2 כוסות עדשים כתומות (480 מ"ל)</li></ul>
    <p>מבשלים 30 דקות.</p><h2>מרק כתום</h2><p>דלעת, בטטה וגזר. מבשלים 40 דקות.</p></body></html>`);
  const pdf = await printer.pdf();
  await printer.close();

  await signIn(page);
  // Stand in for Claude: find the titles in the numbered lines the app sends.
  let sentLines = "";
  await page.route("**/functions/v1/ai", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const { input } = route.request().postDataJSON() as { input: string };
    sentLines = input;
    const lineOf = (title: string) =>
      Number(
        input
          .split("\n")
          .find((l) => l.endsWith(title))!
          .split("|")[0],
      );
    const soup = lineOf("מרק עדשים");
    const orange = lineOf("מרק כתום");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({
        result: {
          recipes: [
            {
              title: "מרק עדשים",
              category: "מרקים",
              start: soup,
              end: orange - 1,
              source_url: null,
            },
            {
              title: "מרק כתום",
              category: "מרקים",
              start: orange,
              end: orange + 1,
              source_url: null,
            },
          ],
        },
      }),
    });
  });

  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cookbook.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf),
  });
  await expect(page.getByText("נמצאו 2 מתכונים.")).toBeVisible({ timeout: 20_000 });
  // Hebrew lines arrive in reading order, numbers included.
  expect(sentLines).toContain('2 כוסות עדשים כתומות (480 מ"ל)');
  expect(sentLines).toContain("# מרקים");
});

test("a PDF without text explains itself", async ({ page }) => {
  await signIn(page);
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 not really"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "לא הצלחנו לקרוא את הקובץ" }),
  ).toBeVisible();
});

test("recipes without a photo: find photos runs in the background and needs no review", async ({
  page,
}) => {
  const email = await signIn(page);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
  const { data: m } = await admin
    .from("book_members")
    .select("book_id")
    .eq("user_id", userId)
    .single();
  await admin.from("ai_access").insert({ book_id: m!.book_id });
  await admin.from("recipes").insert([
    { book_id: m!.book_id, title: "עוגת תפוזים", status: "approved" },
    { book_id: m!.book_id, title: "מרק אפונה", status: "approved" },
  ]);

  await page.goto("/import");
  await expect(page.getByText("ל-2 מתכונים בספר אין תמונה.")).toBeVisible();
  await page.getByRole("button", { name: "למצוא להם תמונות" }).click();
  await expect(page.getByRole("heading", { name: "מחפשים תמונות…" })).toBeVisible();

  // Play the worker: one photo found, one not.
  let handled = 0;
  for (let tries = 0; handled < 2 && tries < 40; tries++) {
    const { data } = await admin.rpc("claim_import_items", { p_limit: 10 });
    const items = (data ?? []) as { id: string; task: string }[];
    for (const item of items.filter((i) => i.task === "find_photo")) {
      await admin.rpc("finish_import_item", {
        p_id: item.id,
        p_status: handled === 0 ? "done" : "failed",
        p_result: null,
        p_error: handled === 0 ? "" : "no_photo",
      });
      handled++;
    }
    if (handled < 2) await new Promise((r) => setTimeout(r, 500));
  }
  await expect(page.getByText("נמצאו תמונות ל-1 מתכונים. ל-1 לא מצאנו.")).toBeVisible({
    timeout: 20_000,
  });
});
