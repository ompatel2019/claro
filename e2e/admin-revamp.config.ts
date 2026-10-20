import { defineConfig } from "@playwright/test";
import { offlineConfig } from "./offline-config";

// Offline admin revamp screenshots with synthetic loaders. No server or credentials.
export default defineConfig({
  ...offlineConfig,
  testMatch: "admin-revamp.offline.spec.ts",
  outputDir: "/tmp/admin-revamp-offline-results",
  timeout: 120_000,
});
