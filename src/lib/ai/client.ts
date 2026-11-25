import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { z } from "zod";
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

const foundSchema = z.object({
  recipes: z.array(
    z.object({
      title: z.string(),
      category: z.string().nullable(),
      start: z.number().int(),
      end: z.number().int(),
      source_url: z.string().nullable(),
    }),
  ),
});

/**
 * Asks Claude where the recipes are in each piece of a document, two
 * pieces at a time (the AI server's limit). Each piece is one AI call.
 */
export async function findRecipes(
  bookId: string,
  prompts: string[],
  onProgress: (done: number, total: number) => void,
): Promise<z.infer<typeof foundSchema>["recipes"]> {
  const results: z.infer<typeof foundSchema>["recipes"][] = [];
  let done = 0;
  const one = async (input: string) => {
    for (let attempt = 0; ; attempt++) {
      const { data, error } = await supabase().functions.invoke("ai", {
        body: { task: "split_document", bookId, input },
      });
      if (!error) {
        const parsed = foundSchema.safeParse(data?.result);
        if (parsed.success) return parsed.data.recipes;
        if (attempt === 0) continue;
        throw new AiError("invalid");
      }
      const code =
        error instanceof FunctionsHttpError
          ? ((await error.context.json().catch(() => null))?.error ?? "ai_failed")
          : "ai_unavailable";
      if (attempt === 0 && RETRYABLE.has(code)) continue;
      throw new AiError(code);
    }
  };
  for (let i = 0; i < prompts.length; i += 2) {
    const batch = await Promise.all(prompts.slice(i, i + 2).map(one));
    results.push(...batch);
    done += batch.length;
    onProgress(done, prompts.length);
  }
  return results.flat();
}
