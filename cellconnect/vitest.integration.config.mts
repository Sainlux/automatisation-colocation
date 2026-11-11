import { defineConfig } from "vitest/config";
import path from "node:path";

/** Tests d'intégration contre un Supabase réel (voir tests/integration/supabase.test.ts). */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 60000, fileParallelism: false },
});
