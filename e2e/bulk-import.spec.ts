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
          ? ["חציל", "בשר טחון", "עגבנייה"]
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
  await page.getByRole("button", { name: "שמירת 2 מתכונים" }).click();
  await expect(page.getByText("נשמרו 2 מתכונים.")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "לספרייה" }).click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(2);
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
  await expect(page.getByRole("button", { name: "שמירת 0 מתכונים" })).toBeDisabled();
});

test("a PDF asks for the Word export", async ({ page }) => {
  await signIn(page);
  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "cookbook.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "כדאי להוריד את המסמך כ-Word" }),
  ).toBeVisible();
});
