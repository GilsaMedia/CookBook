import { Suspense } from "react";
import { SharedScreen } from "./SharedScreen";

/** Recipes other people shared with the signed-in user; ?t=<token> opens a share link. */
export default function SharedPage() {
  return (
    <Suspense>
      <SharedScreen />
    </Suspense>
  );
}
