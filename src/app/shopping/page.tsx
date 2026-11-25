import type { Metadata } from "next";
import { he } from "@/i18n/he";

export const metadata: Metadata = { title: he.nav.shopping };

/** A stub until the shopping list (prompt 7); meals link here with ?meal=<id>. */
export default function ShoppingPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">{he.nav.shopping}</h1>
      <p className="text-muted">{he.meals.shoppingSoon}</p>
    </div>
  );
}
