import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal Vitest setup for RIFF's pure-logic modules (src/lib/**).
// No React/DOM test environment is configured yet — add one (e.g.
// jsdom + @testing-library/react) only when component tests are needed.
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" path alias so tests can import
      // modules the same way app code does.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
