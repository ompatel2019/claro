import { defineConfig } from "@playwright/test";
import config from "../playwright.config";
import { mockServers } from "./mock-servers";
export default defineConfig({
  ...config,
  testDir: ".",
  // The app gets the local mock below; the e2e guard checks this, not the runner env.
  metadata: { ...config.metadata, appSupabaseUrl: "http://127.0.0.1:54328" },
  testMatch: [
    "sprint-feedback.spec.ts",
    "sprint-results.spec.ts",
    "writing-summary.spec.ts",
    "mark.spec.ts",
  ],
  workers: 1,
  use: {
    ...config.use,
    baseURL: "http://localhost:3104",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: mockServers("sprint-results", 3104, 54328),
});
