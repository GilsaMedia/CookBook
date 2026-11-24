import type { Metadata } from "next";
import { Suspense } from "react";
import { he } from "@/i18n/he";
import { LoginScreen } from "./LoginScreen";

export const metadata: Metadata = { title: he.auth.title };

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in a static export.
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
