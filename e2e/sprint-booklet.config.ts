import { defineConfig } from "@playwright/test";
import { offlineConfig } from "./offline-config";

// Booklet modal on a synthetic sprint. No server or credentials.
export default defineConfig({
  ...offlineConfig,
  testMatch: "sprint-booklet.offline.spec.ts",
  outputDir: "/tmp/claro-sprint-booklet-results",
});
