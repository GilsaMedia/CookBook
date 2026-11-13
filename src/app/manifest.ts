import type { MetadataRoute } from "next";
import { he } from "@/i18n/he";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: he.app.name,
    short_name: he.app.shortName,
    description: he.app.description,
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    // Placeholder icons — replace with real artwork before launch.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
