// The `import-worker` Edge Function: works through queued bulk imports.
//
// pg_cron calls it every minute on the hosted project, and the app calls
// it right after queuing a job so work starts at once. It takes no input
// and returns only counts: calling it can't do anything the owner hasn't
// already queued, and the queue (claim_import_items) is service-role only.
// Runs overlap, so the queue itself keeps at most two items processing
// across all runs (the AI server's limit); each run stops in time to finish
// within the Edge Function limit, and the next run picks up the rest.
//
// A recipe can take up to three steps, each its own turn in the queue (so
// no single turn runs long): read it; if the document has only its name,
// find it on the web; then, if it has no photo, find one. "Find photos"
// jobs (task find_photo) add a photo straight to a saved recipe.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importLink, importText, type Source } from "../_shared/ai-import.ts";
import { findPhoto, findRecipeOnline, type Photo } from "../_shared/find-online.ts";
import { savePhoto } from "../_shared/save-photo.ts";

const BUDGET_MS = 70_000; // start new work only this long into a run
const AT_ONCE = 2; // the AI server runs two jobs at a time
const OUTAGE = new Set(["ai_unavailable", "usage_limit"]);
// Lines that aren't the family's own words: navigation, and a document's
// own "nothing was copied here" placeholder.
const NOT_A_NOTE = /^Title:|לתוכן\s*העניינים|הוספה\s*לארוחה|לא\s*הועתק\s*תוכן/;

/** A "recipe" with fewer than two ingredients and no steps is only a name. */
const thin = (r: Recipe & { steps?: string[] }) =>
  (r.ingredients?.length ?? 0) < 2 && (r.steps?.length ?? 0) === 0;

/** What the family wrote under a recipe's name, kept when it's found online. */
const familyNotes = (input: string) =>
  input
    .split("\n")
    .map((l) => l.replace(/^[-●·•\s]+/, "").trim())
    .filter((l) => l && !NOT_A_NOTE.test(l));

type Entry = { title?: string; group?: string | null; sourceUrl?: string | null };
type Recipe = { title?: string; ingredients?: { canonical_name?: string | null }[] };
/** An item's result so far; `stage` is the step still to do. */
type Result = {
  stage?: "lookup" | "photo";
  recipe?: Recipe;
  source?: Source | null;
  photo?: Photo | null;
};
type Item = {
  id: string;
  book_id: string;
  task: "structure_recipe" | "import_url" | "none" | "find_photo";
  input: string;
  attempts: number;
  entry: Entry;
  result: Result | null;
};

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const finish = (id: string, status: string, result: unknown, error: string) =>
    db.rpc("finish_import_item", { p_id: id, p_status: status, p_result: result, p_error: error });

  /** Busy or away isn't the recipe's fault: back to the queue, a little later. */
  const retryable = (item: Item, error: string) =>
    error === "busy" || (OUTAGE.has(error) && item.attempts < 3);

  async function photoStep(item: Item, r: Result) {
    const recipe = r.recipe ?? {};
    const ingredients = (recipe.ingredients ?? [])
      .map((i) => i.canonical_name)
      .filter(Boolean)
      .slice(0, 6)
      .join(", ");
    const { photo, busy } = await findPhoto({
      title: recipe.title || item.entry.title || "",
      hint: ingredients ? `ingredients: ${ingredients}` : null,
      sourceUrl: r.source?.url ?? item.entry.sourceUrl,
    });
    if (busy) return finish(item.id, "queued", r, "busy");
    return finish(item.id, "done", { recipe: r.recipe, source: r.source ?? null, photo }, "");
  }

  async function recipeStep(item: Item) {
    const lookup = item.result?.stage === "lookup";
    const out = lookup
      ? await findRecipeOnline(item.entry.title ?? "", item.entry.group)
      : item.task === "import_url"
        ? await importLink(item.input)
        : await importText(item.input);
    // Next to nothing (a name and a note): look the recipe up on the web.
    if (out.ok && !lookup && item.task === "structure_recipe" && thin(out.result as Recipe))
      return finish(item.id, "queued", { stage: "lookup" }, "next");
    if (out.ok) {
      const recipe = out.result as Recipe & { steps?: string[] };
      const notes = lookup ? familyNotes(item.input) : [];
      if (notes.length)
        recipe.steps = [...(recipe.steps ?? []), `הערה מהמשפחה: ${notes.join(" ")}`];
      const result: Result = { recipe, source: out.source };
      if (out.source?.image) return finish(item.id, "done", result, "");
      return finish(item.id, "queued", { ...result, stage: "photo" }, "next");
    }
    // Only a name in the document: look the recipe up on the web.
    if (out.error === "not_recipe" && item.task === "structure_recipe" && !lookup)
      return finish(item.id, "queued", { stage: "lookup" }, "next");
    if (retryable(item, out.error)) return finish(item.id, "queued", item.result, out.error);
    return finish(item.id, "failed", null, lookup ? "not_recipe" : out.error);
  }

  /** A "find photos" item: a saved recipe of this book that still has no photo. */
  async function attachPhoto(item: Item) {
    let recipeId = "";
    try {
      recipeId = JSON.parse(item.input).recipe_id ?? "";
    } catch {
      // handled below
    }
    const { data: recipe } = await db
      .from("recipes")
      .select("id, title, source_url, ingredients(canonical_name)")
      .eq("id", recipeId)
      .eq("book_id", item.book_id)
      .maybeSingle();
    if (!recipe) return finish(item.id, "failed", null, "gone");
    const { count } = await db
      .from("recipe_images")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipe.id);
    if (count) return finish(item.id, "done", null, "");
    const ingredients = (recipe.ingredients ?? [])
      .map((i: { canonical_name: string | null }) => i.canonical_name)
      .filter(Boolean)
      .slice(0, 6)
      .join(", ");
    const { photo, busy } = await findPhoto({
      title: recipe.title,
      hint: ingredients ? `ingredients: ${ingredients}` : null,
      sourceUrl: recipe.source_url,
    });
    if (busy) return finish(item.id, "queued", null, "busy");
    if (!photo) return finish(item.id, "failed", null, "no_photo");
    const saved = await savePhoto(db, item.book_id, recipe.id, photo);
    return finish(item.id, saved ? "done" : "failed", { photo }, saved ? "" : "image_failed");
  }

  async function work(item: Item) {
    if (item.task === "none") return finish(item.id, "done", null, "");
    if (item.task === "find_photo") return attachPhoto(item);
    if (item.result?.stage === "photo") return photoStep(item, item.result);
    return recipeStep(item);
  }

  const started = Date.now();
  let processed = 0;
  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await db.rpc("claim_import_items", { p_limit: AT_ONCE });
    if (error || !data?.length) break;
    await Promise.all((data as Item[]).map(work));
    processed += data.length;
  }
  return new Response(JSON.stringify({ processed }), {
    headers: { "content-type": "application/json" },
  });
});
