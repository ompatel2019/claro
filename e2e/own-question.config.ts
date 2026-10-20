import { defineConfig } from "@playwright/test";
import config from "../playwright.config";
export default defineConfig({
  ...config,
  testDir: ".",
  // The app gets the local mock below; the e2e guard checks this, not the runner env.
  metadata: { ...config.metadata, appSupabaseUrl: "http://127.0.0.1:54329" },
  testMatch: "own-question.spec.ts",
  workers: 1,
  use: { ...config.use, baseURL: "http://localhost:3103" },
  webServer: [
    {
      cwd: process.cwd(),
      command: "node e2e/own-question-mock.mjs",
      url: "http://127.0.0.1:54329/auth/v1/user",
      reuseExistingServer: false,
    },
    {
      cwd: process.cwd(),
      command: "npm run dev -- -p 3103",
      url: "http://localhost:3103",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_APP_URL: "http://localhost:3103",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-publishable-key",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
        ENABLE_OWN_QUESTION_MARKING: "true",
        ENABLE_OWN_QUESTION_AUTOFILL: "true",
      },
    },
  ],
});
