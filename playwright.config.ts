import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { hasE2ECredentials } from "./e2e/guard";

const port = process.env.PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  // Absolute so configs that spread this one keep the production-target guard.
  globalSetup: path.join(__dirname, "e2e/global-setup.ts"),
  // Local screenshot harness; run via e2e/admin-revamp.config.ts
  testIgnore: ["**/admin-revamp.offline.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  // Dev-server compiles on first visit can take several seconds.
  expect: { timeout: 15_000 },
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${port}`,
        url: `http://localhost:${port}`,
        // A reused server may have loaded production env; credentialed runs start their own.
        reuseExistingServer: !process.env.CI && !hasE2ECredentials(),
      },
});
