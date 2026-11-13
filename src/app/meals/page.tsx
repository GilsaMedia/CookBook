import type { Metadata } from "next";
import { he } from "@/i18n/he";

export const metadata: Metadata = { title: he.nav.meals };

export default function MealsPage() {
  return <h1 className="text-2xl font-semibold">{he.nav.meals}</h1>;
}
