import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

/** A cook session as stored (one per recipe per person). */
export type CookRow = Database["public"]["Tables"]["cook_sessions"]["Row"];

/** Whether a session has anything worth continuing. */
export const hasProgress = (row: Pick<CookRow, "current_step" | "checked_ingredient_ids">) =>
  row.current_step > 0 || row.checked_ingredient_ids.length > 0;

/** The signed-in user's session for a recipe, if there is one (RLS: their own only). */
export async function loadSession(recipeId: string): Promise<CookRow | null> {
  const { data, error } = await supabase()
    .from("cook_sessions")
    .select("*")
    .eq("recipe_id", recipeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Starts a session for a recipe; if another screen just started one, that's the one. */
export async function startSession(recipeId: string): Promise<CookRow> {
  const db = supabase();
  const { data: recipe, error: rErr } = await db
    .from("recipes")
    .select("book_id")
    .eq("id", recipeId)
    .single();
  if (rErr) throw rErr;
  const { data, error } = await db
    .from("cook_sessions")
    .insert({ recipe_id: recipeId, book_id: recipe.book_id })
    .select("*")
    .single();
  if (!error) return data;
  const existing = await loadSession(recipeId);
  if (existing) return existing;
  throw error;
}

/** Back to the first step with nothing checked. */
export async function restartSession(id: string): Promise<CookRow | null> {
  const { data, error } = await supabase()
    .from("cook_sessions")
    .update({ current_step: 0, checked_ingredient_ids: [] })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Checks or unchecks one ingredient without touching the others' checks. */
export async function checkIngredient(
  id: string,
  ingredientId: string,
  checked: boolean,
): Promise<CookRow | null> {
  const { data, error } = await supabase().rpc("cook_check", {
    p_session: id,
    p_ingredient: ingredientId,
    p_checked: checked,
  });
  if (error) throw error;
  return data[0] ?? null;
}

export async function setStep(id: string, step: number): Promise<CookRow | null> {
  const { data, error } = await supabase()
    .from("cook_sessions")
    .update({ current_step: step })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Done cooking: the session goes, so next time starts fresh. */
export async function endSession(id: string): Promise<void> {
  const { error } = await supabase().from("cook_sessions").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Hears every change to a session made on any screen (Realtime; RLS lets
 * through only the user's own). `onLive` says whether it's listening.
 * Returns a function that stops listening.
 */
export function watchSession(
  id: string,
  onRow: (row: CookRow) => void,
  onLive: (live: boolean) => void,
): () => void {
  const db = supabase();
  // `wait`: "listening" only once changes really flow (by default the channel
  // says so earlier, and a change made in between would be missed).
  const channel = db
    .channel(`cook:${id}`, { config: { postgres_changes_options: { wait: true } } })
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "cook_sessions", filter: `id=eq.${id}` },
      (payload) => onRow(payload.new as CookRow),
    )
    .subscribe((status) => onLive(status === "SUBSCRIBED"));
  return () => {
    onLive(false);
    db.removeChannel(channel);
  };
}
