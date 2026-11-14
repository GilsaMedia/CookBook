import type { Metadata } from "next";
import { he } from "@/i18n/he";

export const metadata: Metadata = { title: he.nav.shopping };

export default function ShoppingPage() {
  return <h1 className="text-2xl font-semibold">{he.nav.shopping}</h1>;
}
