import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { importResponseSchema, type ImportResponse } from "./schema";

/** Error codes from the `ai` Edge Function, plus "invalid" for a malformed answer. */
export class AiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// Worth one automatic retry: the model's answer didn't validate or it hiccuped.
const RETRYABLE = new Set(["invalid", "ai_failed"]);

async function callOnce(body: object): Promise<ImportResponse> {
  const { data, error } = await supabase().functions.invoke("ai", { body });
  if (error) {
    const code =
      error instanceof FunctionsHttpError
        ? ((await error.context.json().catch(() => null))?.error ?? "ai_failed")
        : "ai_unavailable";
    throw new AiError(code);
  }
  const parsed = importResponseSchema.safeParse(data);
  if (!parsed.success) throw new AiError("invalid");
  return parsed.data;
}

/**
 * Asks the AI to structure a recipe from a link or pasted text. All access
 * checks happen on the server; this only retries once on a bad answer.
 */
export async function importRecipe(
  bookId: string,
  kind: "url" | "text",
  input: string,
): Promise<ImportResponse> {
  const body = { task: kind === "url" ? "import_url" : "structure_recipe", bookId, input };
  try {
    return await callOnce(body);
  } catch (e) {
    if (e instanceof AiError && RETRYABLE.has(e.code)) return callOnce(body);
    throw e;
  }
}
