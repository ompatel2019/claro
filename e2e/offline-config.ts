import { devices } from "@playwright/test";

export const offlineConfig = {
  testDir: ".",
  workers: 1,
  reporter: "list" as const,
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: process.env.CI ? undefined : "/usr/bin/google-chrome",
      args: ["--no-sandbox"],
    },
  },
};
