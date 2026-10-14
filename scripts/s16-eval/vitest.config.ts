import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  root,
  plugins: [react()],
  test: {
    environment: "node",
    // Only registers matchers; no DOM is needed during setup.
    setupFiles: ["./vitest.setup.ts"],
    include: ["scripts/s16-eval/**/*.eval.ts"],
    testTimeout: 1800000,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
});
