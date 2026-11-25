import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["member_role"];

export type BookSummary = { id: string; name: string; role: Role };
export type BookMember = { userId: string; name: string | null; email: string | null };

/** Thrown with the database's guard message (book_limit, bad_name, …). */
export class BookError extends Error {}

/** Every book the user owns or is a member of, their own first. */
export async function listBooks(): Promise<BookSummary[]> {
  const { data, error } = await supabase()
    .from("book_members")
    .select("book_id, role, books(name)")
    .is("revoked_at", null)
    .order("created_at");
  if (error) throw error;
  return data
    .map((m) => ({ id: m.book_id, name: m.books?.name ?? "", role: m.role }))
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

/** Opens a new book (default categories included); resolves with its id. */
export async function createBook(name: string): Promise<string> {
  const { data, error } = await supabase().rpc("create_book", { p_name: name.trim() });
  if (error) {
    const code = ["book_limit", "bad_name"].find((c) => error.message.includes(c)) ?? "default";
    throw new BookError(code);
  }
  return data;
}

export async function renameBook(id: string, name: string) {
  const { error } = await supabase().from("books").update({ name: name.trim() }).eq("id", id);
  if (error) throw new BookError("default");
}

/** The people the owner let into the book (not the owner). */
export async function bookMembers(bookId: string): Promise<BookMember[]> {
  const { data, error } = await supabase()
    .from("book_members")
    .select("user_id, role, profiles!book_members_user_id_fkey(display_name, email)")
    .eq("book_id", bookId)
    .neq("role", "owner")
    .is("revoked_at", null);
  if (error) throw error;
  return data.map((m) => ({
    userId: m.user_id,
    name: m.profiles?.display_name ?? null,
    email: m.profiles?.email ?? null,
  }));
}

/** Takes someone out of the book. The recipes they added stay. */
export async function removeMember(bookId: string, userId: string) {
  const { error } = await supabase()
    .from("book_members")
    .update({ revoked_at: new Date().toISOString() })
    .eq("book_id", bookId)
    .eq("user_id", userId);
  if (error) throw new BookError("default");
}
