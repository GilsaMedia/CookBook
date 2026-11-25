import { importedRecipeSchema, type ImportedRecipe } from "@/lib/ai/schema";
import type { ImportEntry, ParsedCollection } from "@/lib/import/types";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { importSourceImage, type CurrentBook } from "./book";

type JobRow = Database["public"]["Tables"]["import_jobs"]["Row"];
export type ImportJob = Pick<
  JobRow,
  "id" | "status" | "total" | "done" | "failed" | "format" | "file_name"
>;

/** What the owner chose on the mapping screen, kept with each item. */
export type StoredEntry = Omit<ImportEntry, "text"> & { category: string | null };

export type ImportResult = {
  id: string;
  position: number;
  entry: StoredEntry;
  status: "done" | "failed" | "skipped" | "queued" | "processing";
  error: string | null;
  /** What was sent to the AI: the recipe's own text, or its link. */
  input: string;
  recipe: ImportedRecipe | null;
  source: { url: string; name: string | null; image: string | null } | null;
};

const JOB_COLUMNS = "id, status, total, done, failed, format, file_name";

/** The book's import that isn't finished or saved yet, if any. */
export async function getOpenJob(bookId: string): Promise<ImportJob | null> {
  const { data, error } = await supabase()
    .from("import_jobs")
    .select(JOB_COLUMNS)
    .eq("book_id", bookId)
    .in("status", ["queued", "running", "ready"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

export async function getJob(id: string): Promise<ImportJob> {
  const { data, error } = await supabase()
    .from("import_jobs")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** The book's last saved import that left recipes unread, if any. */
export async function getRetryableJob(bookId: string): Promise<ImportJob | null> {
  const { data, error } = await supabase()
    .from("import_jobs")
    .select(JOB_COLUMNS)
    .eq("book_id", bookId)
    .eq("status", "imported")
    .gt("failed", 0)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

/** Sends a job's unread recipes through the AI again; resolves with the job. */
export async function retryImport(jobId: string): Promise<ImportJob> {
  const db = supabase();
  const { error } = await db.rpc("retry_import", { p_job: jobId });
  if (error) throw new ImportStartError(guardCode(error.message));
  void db.functions.invoke("import-worker", { body: {} });
  return getJob(jobId);
}

/** Thrown with the database's guard message (ai_not_enabled, import_limit, …). */
export class ImportStartError extends Error {}

/**
 * Creates the job, adds one item per kept entry, queues it and wakes the
 * worker. Recipe entries go to the AI as text, link entries as links;
 * kept empty entries need no AI.
 */
export async function startImport(
  book: CurrentBook,
  fileName: string,
  parsed: ParsedCollection,
  categoryFor: (entry: ImportEntry) => string | null,
  keep: (entry: ImportEntry) => boolean,
): Promise<ImportJob> {
  const db = supabase();
  const user = (await db.auth.getUser()).data.user;
  const { data: job, error } = await db
    .from("import_jobs")
    .insert({
      book_id: book.id,
      format: parsed.format,
      file_name: fileName.slice(0, 255),
      created_by: user?.id,
    })
    .select("id")
    .single();
  if (error) throw new ImportStartError(guardCode(error.message));

  const rows = parsed.entries.filter(keep).map((entry, position) => {
    const { text, ...rest } = entry;
    const stored: StoredEntry = { ...rest, category: categoryFor(entry) };
    return {
      job_id: job.id,
      book_id: book.id,
      position,
      entry: stored,
      task:
        entry.kind === "recipe"
          ? "structure_recipe"
          : entry.kind === "link"
            ? "import_url"
            : "none",
      input:
        entry.kind === "recipe"
          ? text.slice(0, 20_000)
          : entry.kind === "link"
            ? (entry.sourceUrl ?? "")
            : "",
    };
  });
  for (let i = 0; i < rows.length; i += 100) {
    const { error: e } = await db.from("import_items").insert(rows.slice(i, i + 100));
    if (e) {
      await db.from("import_jobs").delete().eq("id", job.id);
      throw new ImportStartError(guardCode(e.message));
    }
  }
  const { error: qErr } = await db
    .from("import_jobs")
    .update({ status: "queued" })
    .eq("id", job.id);
  if (qErr) throw new ImportStartError("default");
  // Start at once rather than at the next minute; the schedule does the rest.
  void db.functions.invoke("import-worker", { body: {} });
  return getJob(job.id);
}

const guardCode = (message: string) =>
  ["ai_not_enabled", "import_limit", "import_too_large"].find((c) => message.includes(c)) ??
  "default";

export async function cancelImport(id: string) {
  await supabase().from("import_jobs").update({ status: "cancelled" }).eq("id", id);
}

/** Every item of a job with its validated AI result. */
export async function loadResults(jobId: string): Promise<ImportResult[]> {
  const db = supabase();
  const out: ImportResult[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("import_items")
      .select("id, position, entry, status, error, result, input")
      .eq("job_id", jobId)
      .order("position")
      .range(from, from + 499);
    if (error) throw error;
    for (const row of data) {
      if (row.status === "saved") continue; // saved before a retry
      const result = row.result as { recipe?: unknown; source?: ImportResult["source"] } | null;
      const parsed = result?.recipe ? importedRecipeSchema.safeParse(result.recipe) : null;
      const valid = row.status === "done" && (parsed?.success || !result);
      out.push({
        id: row.id,
        position: row.position,
        entry: row.entry as unknown as StoredEntry,
        status: row.status === "done" && !valid ? "failed" : (row.status as ImportResult["status"]),
        error: row.status === "done" && !valid ? "invalid" : row.error,
        input: row.input,
        recipe: parsed?.success ? parsed.data : null,
        source: result?.source ?? null,
      });
    }
    if (data.length < 500) break;
  }
  return out;
}

/**
 * Saves the reviewed batch: creates the categories the mapping named,
 * then recipes, ingredients and steps in a few large inserts (owners'
 * imports are approved at once), then each source page's photo. Skipped
 * items are marked; the job is marked imported.
 */
export async function saveBatch(
  book: CurrentBook,
  jobId: string,
  results: ImportResult[],
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const db = supabase();

  // Categories: existing by name, new ones created in the mapping's order.
  const categoryId = new Map(book.categories.map((c) => [c.name, c.id]));
  const wanted = [...new Set(results.map((r) => r.entry.category).filter((c): c is string => !!c))];
  const missing = wanted.filter((name) => !categoryId.has(name));
  if (missing.length) {
    const start = book.categories.length + 1;
    const { data, error } = await db
      .from("categories")
      .insert(missing.map((name, i) => ({ book_id: book.id, name, position: start + i })))
      .select("id, name");
    if (error) throw error;
    for (const c of data) categoryId.set(c.name, c.id);
  }

  const toSave = results.map((r) => ({ ...r, newId: crypto.randomUUID() }));
  const total = toSave.length;
  let done = 0;
  for (let i = 0; i < toSave.length; i += 50) {
    const chunk = toSave.slice(i, i + 50);
    const recipes = chunk.map(({ newId, entry, recipe, source }) => ({
      id: newId,
      book_id: book.id,
      category_id: entry.category ? (categoryId.get(entry.category) ?? null) : null,
      title: (recipe?.title || entry.title || "מתכון").slice(0, 200),
      status: "approved" as const,
      source_url: source?.url ?? entry.sourceUrl,
      source_name: source?.name ?? entry.sourceName,
      servings: recipe?.servings ?? null,
      prep_time: recipe?.prep_time ?? null,
      cook_time: recipe?.cook_time ?? null,
      dish_role: recipe?.dish_role ?? null,
      cuisine: recipe?.cuisine ?? null,
      uses_oven: recipe?.uses_oven ?? false,
      oven_temp: recipe?.uses_oven ? recipe.oven_temp : null,
      uses_stovetop: recipe?.uses_stovetop ?? false,
      make_ahead: recipe?.make_ahead ?? false,
    }));
    const { error } = await db.from("recipes").insert(recipes);
    if (error) throw error;
    const ingredients = chunk.flatMap(({ newId, recipe }) =>
      (recipe?.ingredients ?? []).map((ing, position) => ({
        recipe_id: newId,
        book_id: book.id,
        position,
        ...ing,
      })),
    );
    const steps = chunk.flatMap(({ newId, recipe }) =>
      (recipe?.steps ?? []).map((text, position) => ({
        recipe_id: newId,
        book_id: book.id,
        position,
        text,
      })),
    );
    const [ing, st] = await Promise.all([
      ingredients.length ? db.from("ingredients").insert(ingredients) : { error: null },
      steps.length ? db.from("steps").insert(steps) : { error: null },
    ]);
    if (ing.error || st.error) {
      await db
        .from("recipes")
        .delete()
        .in(
          "id",
          chunk.map((c) => c.newId),
        );
      throw ing.error ?? st.error;
    }
    done += chunk.length;
    onProgress(done, total);
  }

  // The source page's photo, best effort and a few at a time.
  const photos = toSave
    .filter(({ source }) => source?.image)
    .map(
      ({ newId, source }) =>
        () =>
          importSourceImage(book.id, newId, source!.image!),
    );
  for (let i = 0; i < photos.length; i += 4)
    await Promise.all(photos.slice(i, i + 4).map((p) => p()));

  await markItems(
    results.map((r) => r.id),
    "saved",
  );
  await db.from("import_jobs").update({ status: "imported" }).eq("id", jobId);
  return total;
}

/** Marks items skipped or saved, so the job's history is honest and a retry skips them. */
async function markItems(ids: string[], status: "skipped" | "saved") {
  for (let i = 0; i < ids.length; i += 100) {
    await supabase()
      .from("import_items")
      .update({ status })
      .in("id", ids.slice(i, i + 100));
  }
}

export const markSkipped = (ids: string[]) => markItems(ids, "skipped");

/**
 * A recipe the AI couldn't read, saved as it was written: the document's
 * own lines become the steps, to tidy up later. Nothing is lost.
 */
export function asWritten(r: ImportResult): ImportResult {
  const lines =
    r.entry.kind === "recipe"
      ? r.input
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("Title:"))
      : [];
  const recipe: ImportedRecipe = {
    is_recipe: true,
    title: (r.entry.title || "מתכון").slice(0, 200),
    servings: null,
    prep_time: null,
    cook_time: null,
    dish_role: null,
    uses_oven: false,
    oven_temp: null,
    uses_stovetop: false,
    make_ahead: false,
    cuisine: null,
    source_language: "he",
    ingredients: [],
    steps: lines,
    confidence: { title: 0, ingredients: 0, steps: 0, times: 0 },
  };
  return { ...r, status: "done", error: null, recipe };
}
