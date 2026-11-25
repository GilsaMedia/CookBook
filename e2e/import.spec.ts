import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signIn } from "./helpers";

// CI can't reach the owner's AI server, so these tests answer for the `ai`
// Edge Function with a fixed structured recipe and exercise everything else
// for real: the review screen, duplicate checks, saving and the recipe page.

const recipe = (over: Record<string, unknown> = {}) => ({
  is_recipe: true,
  title: "מרק עדשים אדומות",
  servings: 6,
  prep_time: 15,
  cook_time: 30,
  dish_role: "soup",
  uses_oven: false,
  oven_temp: null,
  uses_stovetop: true,
  make_ahead: true,
  cuisine: null,
  source_language: "en",
  ingredients: [
    {
      display_text: "2 כוסות עדשים אדומות",
      quantity: 480,
      unit: "ml",
      canonical_name: "עדשים אדומות",
      section: "dry_goods",
      optional: false,
    },
    {
      display_text: "בצל גדול",
      quantity: 1,
      unit: "unit",
      canonical_name: "בצל",
      section: "produce",
      optional: false,
    },
  ],
  steps: ["מטגנים את הבצל.", "מוסיפים עדשים ומים ומבשלים 30 דקות."],
  confidence: { title: 0.95, ingredients: 0.6, steps: 0.9, times: 0.9 },
  ...over,
});

async function answerAi(page: Page, status: number, body: unknown) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  await page.route("**/functions/v1/ai", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          status,
          contentType: "application/json",
          headers: cors,
          body: JSON.stringify(body),
        }),
  );
}

async function signInWithSampleBook(page: Page) {
  const email = await signIn(page);
  execFileSync("node", ["scripts/seed-sample-book.mjs", email], { stdio: "inherit" });
}

test("importing a link already in the book warns, then saves as new with its source", async ({
  page,
}) => {
  await signInWithSampleBook(page);
  const url = "https://example.com/recipes/red-lentil-soup";
  await answerAi(page, 200, { result: recipe(), source: { url, name: "Example", image: null } });

  await page.goto("/add");
  await page.getByLabel("קישור לדף המתכון").fill(url);
  await page.getByRole("button", { name: "ייבוא" }).click();

  await expect(page.getByRole("heading", { name: "בדיקה לפני שמירה" })).toBeVisible();
  await expect(page.getByText("תורגם לעברית")).toBeVisible();
  // Low confidence on ingredients is flagged for checking.
  await expect(page.getByText("כדאי לבדוק", { exact: true })).toHaveCount(1);
  // Same source link as a sample recipe → duplicate warning; saving waits for a choice.
  const warning = page.getByRole("alert").filter({ hasText: "נראה שהמתכון כבר בספר" });
  await expect(warning).toContainText("מרק עדשים כתומות");
  await expect(warning.getByRole("link", { name: "פתיחת הקיים" })).toHaveAttribute(
    "href",
    /\/recipe\?id=/,
  );
  await expect(page.getByRole("button", { name: "שמירה", exact: true })).toBeDisabled();

  await warning.getByRole("button", { name: "שמירה כחדש" }).click();
  await page.getByLabel("שם המתכון").fill("מרק עדשים של סבתא");
  await page.getByRole("button", { name: "שמירה כחדש" }).click();

  await expect(page).toHaveURL(/\/recipe\?id=[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("מרק עדשים של סבתא");
  await expect(page.getByRole("link", { name: /Example/ })).toHaveAttribute("href", url);
  await expect(page.getByText("2 כוסות עדשים אדומות")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(9);
});

test("pasted text is reviewed, edited and saved", async ({ page }) => {
  await signInWithSampleBook(page);
  await answerAi(page, 200, {
    result: recipe({
      title: "עוגיות שוקולד צ׳יפס",
      dish_role: "dessert",
      ingredients: [
        {
          display_text: "200 גרם חמאה",
          quantity: 200,
          unit: "g",
          canonical_name: "חמאה",
          section: "dairy_eggs",
          optional: false,
        },
        {
          display_text: "שוקולד צ׳יפס",
          quantity: null,
          unit: null,
          canonical_name: "שוקולד צ׳יפס",
          section: "baking",
          optional: false,
        },
      ],
      confidence: { title: 0.9, ingredients: 0.9, steps: 0.9, times: 0.9 },
    }),
    source: null,
  });

  await page.goto("/add");
  await page.getByRole("button", { name: "מטקסט" }).click();
  await page
    .getByLabel("המתכון עצמו")
    .fill("Chocolate chip cookies: 200g butter, chocolate chips…");
  await page.getByRole("button", { name: "ייבוא" }).click();

  await expect(page.getByRole("heading", { name: "בדיקה לפני שמירה" })).toBeVisible();
  await expect(page.getByText("נראה שהמתכון כבר בספר")).toHaveCount(0);
  await expect(page.getByLabel("קטגוריה")).toHaveValue(/.+/); // suggested from the dish role
  await page.getByRole("button", { name: "הוספת שלב" }).click();
  await page.getByLabel("אופן ההכנה 3").fill("מגישים עם כוס חלב.");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("עוגיות שוקולד צ׳יפס");
  await expect(page.getByText("מגישים עם כוס חלב.")).toBeVisible();
  await expect(page.getByText("200 גרם חמאה")).toBeVisible();
});

test("server refusals are explained in Hebrew", async ({ page }) => {
  await signIn(page);
  await answerAi(page, 429, { error: "not_enabled" });
  await page.goto("/add");
  await page.getByLabel("קישור לדף המתכון").fill("https://example.com/r");
  await page.getByRole("button", { name: "ייבוא" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "הייבוא בעזרת AI עוד לא הופעל לספר הזה." }),
  ).toBeVisible();
});
