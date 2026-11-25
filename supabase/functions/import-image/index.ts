// The `import-image` Edge Function: copies a recipe's photo from its source
// page into the book's private Storage folder.
//
// The browser can't fetch most sites' images itself (CORS), so this does,
// from public addresses only, images only, up to 5 MB. The upload and the
// recipe_images row are written with the user's own session, so Storage and
// table RLS decide whether they may add a photo to this recipe. No AI, so no
// AI quota. Body: { bookId, recipeId, url, credit?: { name, url } }; the
// credit (the page the photo is from) is shown under the photo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { FetchBlocked, safeFetch } from "../_shared/safe-fetch.ts";

const ORIGINS = (
  Deno.env.get("AI_ALLOWED_ORIGINS") ??
  "https://gilsamedia.github.io,http://localhost:3000,http://localhost:3100"
)
  .split(",")
  .map((o) => o.trim());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method" });
  if (origin && !ORIGINS.includes(origin)) return reply(403, { error: "origin" });

  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return reply(401, { error: "signed_out" });
  // Acts as the user: RLS applies to every read and write below. The public
  // key is the one the app sent (new projects may disable the legacy anon key).
  const publicKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, {
    auth: { persistSession: false },
    // Capitalized so it replaces the client's own Authorization header
    // instead of sending two (the gateway rejects that).
    global: { headers: { Authorization: authorization } },
  });
  const { data: auth, error: authError } = await db.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ""),
  );
  if (!auth.user) {
    console.error("import-image: session check failed:", authError?.status);
    return reply(401, { error: "signed_out" });
  }

  let body: {
    bookId?: string;
    recipeId?: string;
    url?: string;
    credit?: { name?: unknown; url?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "bad_request" });
  }
  if (!UUID.test(body.bookId ?? "") || !UUID.test(body.recipeId ?? "") || !body.url) {
    return reply(400, { error: "bad_request" });
  }

  const creditName = typeof body.credit?.name === "string" ? body.credit.name.slice(0, 200) : "";
  const creditUrl =
    typeof body.credit?.url === "string" && /^https?:\/\//.test(body.credit.url)
      ? body.credit.url.slice(0, 2048)
      : "";
  const credit = creditName && creditUrl ? { credit_name: creditName, credit_url: creditUrl } : {};

  let image;
  try {
    image = await safeFetch(body.url, { maxBytes: 5 * 1024 * 1024, accept: /^image\// });
  } catch (e) {
    return reply(422, { error: e instanceof FetchBlocked ? e.message : "fetch_failed" });
  }
  const type = image.contentType.split(";")[0].trim();
  const ext = TYPES[type];
  if (!ext) return reply(422, { error: "wrong_type" });

  const path = `${body.bookId}/${body.recipeId}/source-${crypto.randomUUID()}.${ext}`;
  const upload = await db.storage
    .from("recipe-images")
    .upload(path, image.body, { contentType: type, upsert: false });
  if (upload.error) return reply(403, { error: "not_allowed" });

  const { error } = await db.from("recipe_images").insert({
    recipe_id: body.recipeId,
    book_id: body.bookId,
    storage_path: path,
    position: 0,
    ...credit,
  });
  if (error) {
    await db.storage.from("recipe-images").remove([path]);
    return reply(403, { error: "not_allowed" });
  }
  return reply(200, { path });
});
