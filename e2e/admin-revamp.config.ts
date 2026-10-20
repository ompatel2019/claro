import { defineConfig, devices } from "@playwright/test";

// Offline admin revamp screenshots with synthetic loaders. No server or credentials.
export default defineConfig({
  testDir: ".",
  testMatch: "admin-revamp.offline.spec.ts",
  outputDir: "/tmp/admin-revamp-offline-results",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: process.env.CI ? undefined : "/usr/bin/google-chrome",
      args: ["--no-sandbox"],
    },
  },
});
