/**
 * Demo mode: a static build with the sample book and no sign-in
 * (`npm run build:demo`), for trying the screens without Supabase. Never set
 * for the real site.
 */
export const isDemo = process.env.NEXT_PUBLIC_DEMO === "1";

/** Path prefix the app is served under (e.g. "/CookBook" on GitHub Pages). */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a public-folder path with the base path. next/link does this itself. */
export const withBase = (path: string) => `${basePath}${path}`;
