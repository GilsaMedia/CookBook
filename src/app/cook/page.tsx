import { Suspense } from "react";
import { CookScreen } from "./CookScreen";

/** Cook mode: /cook?id=<recipe uuid>. One static page serves every recipe. */
export default function CookPage() {
  return (
    <Suspense>
      <CookScreen />
    </Suspense>
  );
}
