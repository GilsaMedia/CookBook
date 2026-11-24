import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { PressFeedback } from "@/components/PressFeedback";
import { he } from "@/i18n/he";
import { isDemo, withBase } from "@/lib/demo";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: he.app.name,
  title: { default: he.app.name, template: `%s · ${he.app.name}` },
  description: he.app.description,
  appleWebApp: { capable: true, title: he.app.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { apple: withBase("/icons/apple-touch-icon.png") },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh antialiased">
        {/* The static demo has no service worker: Pages serves it fresh on every visit. */}
        <SerwistProvider
          swUrl={withBase("/serwist/sw.js")}
          disable={process.env.NODE_ENV === "development" || isDemo}
        >
          <PressFeedback />
          <main className="mx-auto max-w-xl px-4 md:max-w-3xl lg:max-w-5xl pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
          <BottomNav />
        </SerwistProvider>
      </body>
    </html>
  );
}
