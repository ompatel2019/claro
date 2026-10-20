import { defineConfig, devices } from "@playwright/test";

// Offline regressions render real Lane C pages with synthetic reads. No server or credentials.
export default defineConfig({
  testDir: ".",
  testMatch: "pages.offline.spec.ts",
  outputDir: "/tmp/it2-pages-offline-results",
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
