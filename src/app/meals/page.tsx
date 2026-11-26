import type { Metadata } from "next";
import { Suspense } from "react";
import { he } from "@/i18n/he";
import { MealsScreen } from "./MealsScreen";

export const metadata: Metadata = { title: he.nav.meals };

/** Meals: the list, ?id=<meal> for one meal, &view=page for its "דף ארוחה". */
export default function MealsPage() {
  return (
    <Suspense>
      <MealsScreen />
    </Suspense>
  );
}
