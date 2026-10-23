import { defineConfig } from "@playwright/test";
import { offlineConfig } from "./offline-config";

// Sprint setup on synthetic topics and counts. No server or credentials.
export default defineConfig({
  ...offlineConfig,
  testMatch: "sprint-setup.offline.spec.ts",
  outputDir: "/tmp/claro-sprint-setup-results",
});
