import type { Metadata } from "next";
import { Suspense } from "react";
import { he } from "@/i18n/he";
import { ShoppingScreen } from "./ShoppingScreen";

export const metadata: Metadata = { title: he.nav.shopping };

/** The shopping list of a meal: ?meal=<id>, else the active meal's. */
export default function ShoppingPage() {
  return (
    <Suspense>
      <ShoppingScreen />
    </Suspense>
  );
}
