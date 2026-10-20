import { defineConfig } from "@playwright/test";
import config from "../playwright.config";
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
  webServer: [
    {
      cwd: process.cwd(),
      command: "node e2e/sprint-results-mock.mjs",
      url: "http://127.0.0.1:54328/auth/v1/user",
      reuseExistingServer: false,
    },
    {
      cwd: process.cwd(),
      command: "npm run dev -- -p 3104",
      url: "http://localhost:3104",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_APP_URL: "http://localhost:3104",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54328",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-publishable-key",
      },
    },
  ],
});
