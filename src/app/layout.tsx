import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthProvider } from "@/components/auth/AuthProvider";
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
  icons: { icon: withBase("/favicon.ico"), apple: withBase("/icons/apple-touch-icon.png") },
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
        {/* No service worker for the sample-book demo build. */}
        <SerwistProvider
          // The root copy (scripts/postbuild-sw.mjs): a static host can't widen
          // the scope of /serwist/sw.js with a header.
          swUrl={withBase("/sw.js")}
          options={{ scope: withBase("/") }}
          disable={process.env.NODE_ENV === "development" || isDemo}
        >
          <AuthProvider>
            <PressFeedback />
            <main className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] md:max-w-3xl lg:max-w-5xl">
              <AuthGate>{children}</AuthGate>
            </main>
            <BottomNav />
          </AuthProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
