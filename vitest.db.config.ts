import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests against the local Supabase stack (`npx supabase start`).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
    globalSetup: ["supabase/tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
