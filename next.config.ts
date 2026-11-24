import path from "node:path";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// `npm run build:pages` builds a static demo (sample book, no sign-in) for
// GitHub Pages. See scripts/build-pages.mjs.
const pagesExport = process.env.PAGES_EXPORT === "1";

const nextConfig: NextConfig = {
  turbopack: {
    // The Pages build runs from a temporary copy inside the repo whose
    // node_modules links back here, so the root must be the repo itself.
    ...(pagesExport && { root: path.resolve(process.cwd(), "..") }),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(pagesExport && {
    output: "export",
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default withSerwist(nextConfig);
