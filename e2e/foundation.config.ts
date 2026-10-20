import { defineConfig } from "@playwright/test";
import { offlineConfig } from "./offline-config";
export default defineConfig({
  ...offlineConfig,
  testMatch: "foundation.offline.spec.ts",
  outputDir: "/tmp/claro-foundation-results",
});
