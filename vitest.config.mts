import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside the Next.js server bundle; it's a no-op in tests.
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  // Live tests hit real APIs (several sequential calls) → longer timeout.
  test: { include: ["src/**/*.test.ts"], testTimeout: process.env.LIVE ? 30_000 : 5_000 },
});
