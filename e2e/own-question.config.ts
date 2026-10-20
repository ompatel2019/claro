import { defineConfig } from "@playwright/test";
import config from "../playwright.config";
import { mockServers } from "./mock-servers";
export default defineConfig({
  ...config,
  testDir: ".",
  // The app gets the local mock below; the e2e guard checks this, not the runner env.
  metadata: { ...config.metadata, appSupabaseUrl: "http://127.0.0.1:54329" },
  testMatch: "own-question.spec.ts",
  workers: 1,
  use: { ...config.use, baseURL: "http://localhost:3103" },
  webServer: mockServers("own-question", 3103, 54329, {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
    ENABLE_OWN_QUESTION_MARKING: "true",
    ENABLE_OWN_QUESTION_AUTOFILL: "true",
  }),
});
