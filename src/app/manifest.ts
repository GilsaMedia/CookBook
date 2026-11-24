import type { MetadataRoute } from "next";
import { he } from "@/i18n/he";
import { withBase } from "@/lib/demo";

// Required by the static Pages export; the manifest never varies per request.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: he.app.name,
    short_name: he.app.shortName,
    description: he.app.description,
    lang: "he",
    dir: "rtl",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    // Placeholder icons — replace with real artwork before launch.
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: withBase("/icons/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
