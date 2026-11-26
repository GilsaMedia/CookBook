import { supabase } from "@/lib/supabase/client";
import type { CurrentBook } from "./book";

/**
 * Sharing recipes with people outside the book (migration
 * 20261125190000_sharing.sql). The owner shares the whole book or chosen
 * recipes with people they name by email; each person later chooses what
 * to add, and gets copies in their own book tagged "שותף מ<name>".
 */

export type SentShare = {
  id: string;
  /** Who it's for: an email, or (a link nobody opened yet) null. */
  toEmail: string | null;
  /** Shared as a link rather than to an email. */
  byLink: boolean;
  /** null: the whole book. */
  recipeCount: number | null;
  status: "pending" | "accepted" | "declined";
  addedCount: number;
  createdAt: string;
  /** An invitation into the book itself. */
  canAdd: boolean;
  /** Took the whole book: gets every recipe added later too. */
  follow: boolean;
};

export type IncomingShare = {
  id: string;
  senderName: string;
  recipeCount: number | null;
  createdAt: string;
  canAdd: boolean;
  fromBookId: string;
};

export type SharedRecipe = { id: string; title: string; category: string | null };

/** Thrown with the database's guard message (share_self, share_limit, …). */
export class ShareError extends Error {}

const code = (message: string) =>
  [
    "share_self",
    "share_bad_recipe",
    "share_limit",
    "already_answered",
    "not_found",
    "no_book",
  ].find((c) => message.includes(c)) ?? "default";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => EMAIL.test(normalizeEmail(e));

async function me() {
  const { data } = await supabase().auth.getUser();
  return data.user;
}

/** The name people see the shares under; the user's profile name. */
export async function getMyName(): Promise<string> {
  const user = await me();
  if (!user) return "";
  const { data } = await supabase()
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return data?.display_name ?? "";
}

/** Shares the whole book (recipeIds null) or some recipes, one share per person. */
export async function shareRecipes(input: {
  book: CurrentBook;
  emails: string[];
  recipeIds: string[] | null;
  senderName: string;
  /** Invite them into the book itself (whole book only). */
  canAdd?: boolean;
}): Promise<void> {
  const db = supabase();
  const user = await me();
  if (!user) throw new ShareError("default");
  const name = input.senderName.trim().slice(0, 40);
  // Remembered for next time (users may change their own name).
  await db.from("profiles").update({ display_name: name }).eq("id", user.id);
  const rows = [...new Set(input.emails.map(normalizeEmail))].map((to_email) => ({
    from_book_id: input.book.id,
    from_user: user.id,
    sender_name: name,
    to_email,
    recipe_ids: input.recipeIds,
    can_add: input.recipeIds === null && !!input.canAdd,
  }));
  const { error } = await db.from("shares").insert(rows);
  if (error) throw new ShareError(code(error.message));
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A share as a link, for one person: whoever opens it first (and signs in)
 * gets it. Only the token's SHA-256 is stored; resolves with the link.
 */
export async function createShareLink(input: {
  book: CurrentBook;
  recipeIds: string[] | null;
  senderName: string;
  canAdd?: boolean;
  origin: string;
  path: (token: string) => string;
}): Promise<string> {
  const db = supabase();
  const user = await me();
  if (!user) throw new ShareError("default");
  const name = input.senderName.trim().slice(0, 40);
  await db.from("profiles").update({ display_name: name }).eq("id", user.id);
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const { error } = await db.from("shares").insert({
    from_book_id: input.book.id,
    from_user: user.id,
    sender_name: name,
    to_email: null,
    token_hash: tokenHash,
    recipe_ids: input.recipeIds,
    can_add: input.recipeIds === null && !!input.canAdd,
  });
  if (error) throw new ShareError(code(error.message));
  return new URL(input.path(token), input.origin).toString();
}

/** Opening a share link: it becomes the signed-in user's. Resolves with the share's id. */
export async function claimShare(token: string): Promise<string> {
  const { data, error } = await supabase().rpc("claim_share", { p_token: token });
  if (error) throw new ShareError(code(error.message));
  return data;
}

/** What this owner shared, newest first. */
export async function sentShares(bookId: string): Promise<SentShare[]> {
  const user = await me();
  const { data, error } = await supabase()
    .from("shares")
    .select(
      "id, to_email, token_hash, recipe_ids, status, added_count, created_at, can_add, follow",
    )
    .eq("from_book_id", bookId)
    .eq("from_user", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    toEmail: s.to_email,
    byLink: s.token_hash !== null,
    recipeCount: s.recipe_ids?.length ?? null,
    status: s.status,
    addedCount: s.added_count,
    createdAt: s.created_at,
    canAdd: s.can_add,
    follow: s.follow,
  }));
}

/** Stops a whole-book share's automatic updates (either side may). */
export async function stopUpdates(id: string) {
  const { error } = await supabase().rpc("stop_share_updates", { p_share: id });
  if (error) throw new ShareError("default");
}

/** Takes back a share nobody has answered yet. */
export async function withdrawShare(id: string) {
  const { error } = await supabase().from("shares").delete().eq("id", id);
  if (error) throw new ShareError("default");
}

/** Shares waiting for the signed-in user. */
export async function incomingShares(): Promise<IncomingShare[]> {
  const user = await me();
  if (!user?.email) return [];
  const { data, error } = await supabase()
    .from("shares")
    .select("id, sender_name, recipe_ids, created_at, can_add, from_book_id")
    .eq("to_email", normalizeEmail(user.email))
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return data.map((s) => ({
    id: s.id,
    senderName: s.sender_name,
    recipeCount: s.recipe_ids?.length ?? null,
    createdAt: s.created_at,
    canAdd: s.can_add,
    fromBookId: s.from_book_id,
  }));
}

/** The shared recipes' titles and categories, before choosing. */
export async function previewShare(id: string): Promise<SharedRecipe[]> {
  const { data, error } = await supabase().rpc("share_preview", { p_share: id });
  if (error) throw new ShareError(code(error.message));
  return data.map((r) => ({ id: r.recipe_id, title: r.title, category: r.category }));
}

export async function declineShare(id: string) {
  const { error } = await supabase().from("shares").update({ status: "declined" }).eq("id", id);
  if (error) throw new ShareError("default");
}

/**
 * Accepts a share: copies the chosen recipes into one of the user's own
 * books (all of them, and every one added later, when recipeIds is null),
 * or for an invitation, joins the sharer's book. Resolves with how many
 * recipes were copied.
 */
export async function acceptShare(
  id: string,
  recipeIds: string[] | null,
  bookId?: string,
): Promise<number> {
  const { data, error } = await supabase().rpc("accept_share", {
    p_share: id,
    ...(recipeIds ? { p_recipe_ids: recipeIds } : {}),
    ...(bookId ? { p_book: bookId } : {}),
  });
  if (error) throw new ShareError(code(error.message));
  return data;
}

/**
 * Brings followed books up to date: recipes their owners added since are
 * copied in (with their photos). Resolves with who added how many.
 */
export async function syncSharedBooks(): Promise<{ senderName: string; added: number }[]> {
  const { data, error } = await supabase().rpc("sync_shared_books");
  if (error || !data?.length) return [];
  for (const row of data) await copySharedPhotos(row.share_id);
  return data.map((r) => ({ senderName: r.sender_name, added: r.added }));
}

/**
 * Copies the accepted recipes' photos into the user's book. Storage copies
 * on the server (nothing is downloaded); the originals stay readable only
 * until each recipe is marked done. A recipe without photos yet stays open,
 * so photos its owner adds a little later still follow. Best effort.
 */
export async function copySharedPhotos(
  shareId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const db = supabase();
  const { data, error } = await db.rpc("share_photos", { p_share: shareId });
  if (error || !data) return;
  const byRecipe = new Map<string, typeof data>();
  for (const row of data)
    byRecipe.set(row.from_recipe_id, [...(byRecipe.get(row.from_recipe_id) ?? []), row]);
  const groups = [...byRecipe.entries()];
  let done = 0;
  const copyOne = async ([fromId, rows]: (typeof groups)[number]) => {
    const hasPhotos = rows.some((r) => r.storage_path);
    for (const row of rows) {
      if (!row.storage_path) continue;
      const ext = row.storage_path.split(".").pop() ?? "jpg";
      const path = `${row.to_book_id}/${row.to_recipe_id}/shared-${crypto.randomUUID()}.${ext}`;
      const copied = await db.storage.from("recipe-images").copy(row.storage_path, path);
      if (copied.error) continue;
      const { error: rowError } = await db.from("recipe_images").insert({
        recipe_id: row.to_recipe_id,
        book_id: row.to_book_id,
        storage_path: path,
        position: row.position ?? 0,
        credit_name: row.credit_name,
        credit_url: row.credit_url,
      });
      if (rowError) await db.storage.from("recipe-images").remove([path]);
    }
    if (hasPhotos)
      await db.rpc("share_photos_done", { p_share: shareId, p_from_recipe_ids: [fromId] });
    onProgress?.(++done, groups.length);
  };
  for (let i = 0; i < groups.length; i += 4) await Promise.all(groups.slice(i, i + 4).map(copyOne));
}
