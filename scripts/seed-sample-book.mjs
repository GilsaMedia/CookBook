#!/usr/bin/env node
/**
 * Fills a book with the 8 Hebrew sample recipes (src/lib/data/sample-recipes.json)
 * and the sample exclusions, against the local Supabase stack.
 *
 *   npm run db:seed                    # dev@cookbook.local, password "cookbook-dev"
 *   npm run db:seed -- you@example.com # an existing local account's book
 *
 * Re-running replaces the book's recipes and preferences, so it's safe to repeat.
 * `seedSampleBook` is also used by the e2e tests.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(
  readFileSync(path.join(here, "../src/lib/data/sample-recipes.json"), "utf8"),
);

const DEV_EMAIL = "dev@cookbook.local";
const DEV_PASSWORD = "cookbook-dev";

/** URL and service-role key of the running local stack, from the Supabase CLI. */
export function localSupabase() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(out.slice(out.indexOf("{")));
  return { url: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

/** Service-role client. Bypasses RLS: only for seeding local data. */
export function adminClient({ url, serviceRoleKey } = localSupabase()) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** The book `userId` owns (the signup trigger creates exactly one). */
export async function ownedBookId(db, userId) {
  const row = check(
    await db
      .from("book_members")
      .select("book_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .single(),
  );
  return row.book_id;
}

/** Replaces the book's recipes, photos and preferences with the sample set. */
export async function seedSampleBook(db, bookId) {
  // Deleting recipes cascades to recipe_images rows, but not to the files.
  const { data: folders } = await db.storage.from("recipe-images").list(bookId);
  for (const folder of folders ?? []) {
    const { data: files } = await db.storage.from("recipe-images").list(`${bookId}/${folder.name}`);
    const paths = (files ?? []).map((f) => `${bookId}/${folder.name}/${f.name}`);
    if (paths.length) check(await db.storage.from("recipe-images").remove(paths));
  }
  check(await db.from("recipes").delete().eq("book_id", bookId));
  check(await db.from("preferences").delete().eq("book_id", bookId));

  const categories = check(await db.from("categories").select("id, name").eq("book_id", bookId));
  const categoryId = new Map(categories.map((c) => [c.name, c.id]));
  const recipeIds = new Map();

  for (const r of sample.recipes) {
    // Ids are generated per book: recipe ids are global, books are not.
    const { id } = check(
      await db
        .from("recipes")
        .insert({
          book_id: bookId,
          category_id: categoryId.get(r.category) ?? null,
          title: r.title,
          status: "approved",
          source_name: r.source_name,
          source_url: r.source_url,
          servings: r.servings,
          prep_time: r.prep_time,
          cook_time: r.cook_time,
          dish_role: r.dish_role,
          cuisine: r.cuisine,
          uses_oven: r.uses_oven,
          oven_temp: r.oven_temp,
          uses_stovetop: r.uses_stovetop,
          make_ahead: r.make_ahead,
        })
        .select("id")
        .single(),
    );
    recipeIds.set(r.title, id);

    if (r.image) {
      // Private bucket; the path must start with book_id/recipe_id/ (RLS).
      const storagePath = `${bookId}/${id}/${r.image.file}`;
      const bytes = readFileSync(path.join(here, "../public/sample-photos", r.image.file));
      check(
        await db.storage
          .from("recipe-images")
          .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true }),
      );
      check(
        await db
          .from("recipe_images")
          .insert({ recipe_id: id, book_id: bookId, storage_path: storagePath, position: 0 }),
      );
    }

    check(
      await db.from("ingredients").insert(
        r.ingredients.map((ing, position) => ({
          recipe_id: id,
          book_id: bookId,
          position,
          ...ing,
        })),
      ),
    );
    check(
      await db
        .from("steps")
        .insert(
          r.steps.map((text, position) => ({ recipe_id: id, book_id: bookId, position, text })),
        ),
    );
  }

  check(
    await db.from("preferences").insert(
      sample.exclusions.map((e) => ({
        book_id: bookId,
        scope: e.scope,
        category_id: e.category ? categoryId.get(e.category) : null,
        recipe_id: e.recipe ? recipeIds.get(e.recipe) : null,
        excluded_ingredients: e.ingredients,
      })),
    ),
  );
  return recipeIds;
}

async function userIdFor(db, email) {
  for (let page = 1; ; page++) {
    const { users } = check(await db.auth.admin.listUsers({ page, perPage: 200 }));
    const user = users.find((u) => u.email === email);
    if (user) return user.id;
    if (users.length < 200) return null;
  }
}

async function main() {
  const email = process.argv[2] ?? DEV_EMAIL;
  const db = adminClient();
  let userId = await userIdFor(db, email);
  if (!userId) {
    if (email !== DEV_EMAIL) throw new Error(`No local account for ${email}. Sign in once first.`);
    const { user } = check(
      await db.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true }),
    );
    userId = user.id;
  }
  const bookId = await ownedBookId(db, userId);
  const ids = await seedSampleBook(db, bookId);
  console.log(`Seeded ${ids.size} sample recipes into the book of ${email}.`);
  if (email === DEV_EMAIL)
    console.log(`Sign in at /login with ${email} (code arrives in Mailpit).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
