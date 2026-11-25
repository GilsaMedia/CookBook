import { Suspense } from "react";
import { ShareScreen } from "./ShareScreen";

/** Sharing recipes with people: /share, or /share?recipe=<id> for one recipe. */
export default function SharePage() {
  return (
    <Suspense>
      <ShareScreen />
    </Suspense>
  );
}
