import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "foundation.offline.spec.ts",
  outputDir: "/tmp/claro-foundation-results",
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
