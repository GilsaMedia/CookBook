import type { Metadata } from "next";
import { safeNext } from "@/lib/auth/redirect";
import { he } from "@/i18n/he";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: he.auth.title };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{he.auth.title}</h1>
        <p className="text-base text-muted">{he.auth.intro}</p>
      </div>
      <LoginForm
        next={safeNext(next)}
        initialError={error === "link" ? he.auth.errors.linkFailed : undefined}
      />
    </div>
  );
}
