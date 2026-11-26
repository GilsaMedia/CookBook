import type { Metadata } from "next";
import { SoonBadge } from "@/components/SoonBadge";
import { he } from "@/i18n/he";

export const metadata: Metadata = { title: he.nav.shopping };

/** "בקרוב" until the shopping list (prompt 7). */
export default function ShoppingPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        {he.nav.shopping}
        <SoonBadge className="text-xs" />
      </h1>
      <p className="text-muted">{he.meals.shoppingSoon}</p>
    </div>
  );
}
