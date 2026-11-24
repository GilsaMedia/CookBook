import { Suspense } from "react";
import { RecipeScreen } from "./RecipeScreen";

/** Recipe page: /recipe?id=<uuid>. One static page serves every recipe. */
export default function RecipePage() {
  return (
    <Suspense>
      <RecipeScreen />
    </Suspense>
  );
}
