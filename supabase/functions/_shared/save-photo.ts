// Copies a photo from the web into a recipe's private Storage folder, with
// its credit. Service role: the import worker checks that the recipe is in
// the job's book before calling this.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Photo } from "./find-online.ts";
import { safeFetch } from "./safe-fetch.ts";

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export async function savePhoto(
  db: SupabaseClient,
  bookId: string,
  recipeId: string,
  photo: Photo,
): Promise<boolean> {
  let image;
  try {
    image = await safeFetch(photo.image, { maxBytes: 5 * 1024 * 1024, accept: /^image\// });
  } catch {
    return false;
  }
  const type = image.contentType.split(";")[0].trim();
  const ext = IMAGE_TYPES[type];
  if (!ext) return false;
  const path = `${bookId}/${recipeId}/web-${crypto.randomUUID()}.${ext}`;
  const upload = await db.storage
    .from("recipe-images")
    .upload(path, image.body, { contentType: type, upsert: false });
  if (upload.error) return false;
  const { error } = await db.from("recipe_images").insert({
    recipe_id: recipeId,
    book_id: bookId,
    storage_path: path,
    position: 0,
    credit_name: photo.site.slice(0, 200),
    credit_url: photo.page,
  });
  if (error) {
    await db.storage.from("recipe-images").remove([path]);
    return false;
  }
  return true;
}
