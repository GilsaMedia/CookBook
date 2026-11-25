// The `import-worker` Edge Function: works through queued bulk imports.
//
// pg_cron calls it every minute on the hosted project, and the app calls
// it right after queuing a job so work starts at once. It takes no input
// and returns only counts: calling it can't do anything the owner hasn't
// already queued, and the queue (claim_import_items) is service-role only.
// Each run claims two items at a time and stops in time to finish within
// the Edge Function limit; the next run picks up the rest.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importLink, importText } from "../_shared/ai-import.ts";

const BUDGET_MS = 70_000; // start new work only this long into a run
const PER_CLAIM = 2; // the AI server runs two jobs at a time
const RETRYABLE = new Set(["busy", "ai_unavailable", "usage_limit"]);

type Item = {
  id: string;
  task: "structure_recipe" | "import_url" | "none";
  input: string;
  attempts: number;
};

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
    },
  );
  const finish = (id: string, status: string, result: unknown, error: string) =>
    db.rpc("finish_import_item", { p_id: id, p_status: status, p_result: result, p_error: error });

  async function work(item: Item) {
    if (item.task === "none") return finish(item.id, "done", null, "");
    const out =
      item.task === "import_url" ? await importLink(item.input) : await importText(item.input);
    if (out.ok) return finish(item.id, "done", { recipe: out.result, source: out.source }, "");
    // The server being busy or away isn't the recipe's fault: try again later.
    if (RETRYABLE.has(out.error) && item.attempts < 3)
      return finish(item.id, "queued", null, out.error);
    return finish(item.id, "failed", null, out.error);
  }

  const started = Date.now();
  let processed = 0;
  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await db.rpc("claim_import_items", { p_limit: PER_CLAIM });
    if (error || !data?.length) break;
    await Promise.all((data as Item[]).map(work));
    processed += data.length;
  }
  return new Response(JSON.stringify({ processed }), {
    headers: { "content-type": "application/json" },
  });
});
