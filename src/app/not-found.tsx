import Link from "next/link";
import { he } from "@/i18n/he";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-bold">{he.recipe.notFound}</h1>
      <p className="text-muted">{he.recipe.notFoundHint}</p>
      <Link href="/" className="press flex h-11 items-center font-medium text-accent">
        {he.recipe.back}
      </Link>
    </div>
  );
}
