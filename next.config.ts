import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// The app is a static site (GitHub Pages). Data and sign-in go straight from
// the browser to Supabase, where Row-Level Security protects every row.
const nextConfig: NextConfig = {
  output: "export",
  // "/CookBook" on GitHub Pages; empty locally.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
