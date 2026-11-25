import { Suspense } from "react";
import { LibraryScreen } from "./LibraryScreen";

/** The library; ?add=<meal> or ?pick=<dish>&meal=<meal> to choose a dish for a meal. */
export default function LibraryPage() {
  return (
    <Suspense>
      <LibraryScreen />
    </Suspense>
  );
}
