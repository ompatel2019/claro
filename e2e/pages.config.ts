import { defineConfig } from "@playwright/test";
import { offlineConfig } from "./offline-config";

// Offline regressions render real Lane C pages with synthetic reads. No server or credentials.
export default defineConfig({
  ...offlineConfig,
  testMatch: "pages.offline.spec.ts",
  outputDir: "/tmp/it2-pages-offline-results",
});
