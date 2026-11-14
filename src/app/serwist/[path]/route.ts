import { createSerwistRoute } from "@serwist/turbopack";

// Serves the compiled service worker at /serwist/sw.js (Turbopack has no
// build plugins, so Serwist bundles src/app/sw.ts through this route).
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  },
);
