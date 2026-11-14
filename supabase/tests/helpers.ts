import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;
export type TestUser = { id: string; email: string; client: Client; bookId: string };

const env = () => inject("supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: bypasses RLS. Used only to arrange and verify. */
export const admin = (): Client => createClient<Database>(env().url, env().serviceRoleKey, options);

/** Signed-out client. */
export const anon = (): Client => createClient<Database>(env().url, env().anonKey, options);

const created: string[] = [];

/** Creates a confirmed user (the signup trigger gives them a book) and signs them in. */
export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.local`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);

  const client = createClient<Database>(env().url, env().anonKey, options);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  const { data: membership, error: mErr } = await admin()
    .from("book_members")
    .select("book_id")
    .eq("user_id", data.user.id)
    .eq("role", "owner")
    .single();
  if (mErr) throw mErr;

  return { id: data.user.id, email, client, bookId: membership.book_id };
}

/** Deletes every user created in this file, and the books they owned. */
export async function cleanupUsers() {
  const db = admin();
  const { data: owned } = await db
    .from("book_members")
    .select("book_id")
    .in("user_id", created)
    .eq("role", "owner");
  const bookIds = (owned ?? []).map((m) => m.book_id);
  if (bookIds.length) {
    for (const bookId of bookIds) {
      const { data: folders } = await db.storage.from("recipe-images").list(bookId);
      for (const folder of folders ?? []) {
        const { data: files } = await db.storage
          .from("recipe-images")
          .list(`${bookId}/${folder.name}`);
        const paths = (files ?? []).map((f) => `${bookId}/${folder.name}/${f.name}`);
        if (paths.length) await db.storage.from("recipe-images").remove(paths);
      }
    }
    await db.from("books").delete().in("id", bookIds);
  }
  for (const id of created.splice(0)) await db.auth.admin.deleteUser(id);
}

/** A tiny valid PNG, enough for the bucket's mime-type check. */
export const png = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    { type: "image/png" },
  );

/** Inserts an approved recipe with one ingredient, one step and an image, as the given client. */
export async function seedRecipe(
  user: TestUser,
  opts: { as?: Client; status?: Database["public"]["Enums"]["recipe_status"]; title?: string } = {},
) {
  const db = opts.as ?? user.client;
  const { data: recipe, error } = await db
    .from("recipes")
    .insert({
      book_id: user.bookId,
      title: opts.title ?? "מרק גזר",
      status: opts.status ?? "approved",
    })
    .select()
    .single();
  if (error) throw error;

  const ing = await db
    .from("ingredients")
    .insert({
      book_id: user.bookId,
      recipe_id: recipe.id,
      display_text: "3 גזרים",
      canonical_name: "גזר",
    });
  if (ing.error) throw ing.error;
  const step = await db
    .from("steps")
    .insert({ book_id: user.bookId, recipe_id: recipe.id, position: 1, text: "מקלפים" });
  if (step.error) throw step.error;

  const path = `${user.bookId}/${recipe.id}/photo.png`;
  const up = await db.storage.from("recipe-images").upload(path, png());
  if (up.error) throw up.error;
  const img = await db
    .from("recipe_images")
    .insert({ book_id: user.bookId, recipe_id: recipe.id, storage_path: path });
  if (img.error) throw img.error;

  return { recipe, imagePath: path };
}
