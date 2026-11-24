import { staticRecipeIds } from "@/lib/data";

/**
 * Recipe pages to prerender in the static demo. scripts/build-pages.mjs
 * re-exports this from page.tsx in its temporary copy only; the real app
 * renders recipes per request.
 */
export function generateStaticParams() {
  return staticRecipeIds().map((id) => ({ id }));
}
