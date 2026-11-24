import { Suspense } from "react";
import { Callback } from "./Callback";

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
