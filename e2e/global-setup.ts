import type { FullConfig } from "@playwright/test";
import { assertSafeE2ETarget, GUARD_FLAG } from "./guard";

/**
 * Aborts the whole run before any spec signs in against a non-test target.
 * Checks the runner's NEXT_PUBLIC_SUPABASE_URL (also what a Playwright-started
 * app server gets, since it overrides .env files) and each project's resolved
 * baseURL. Mock configs pass when credentials are unset or point at a test project.
 */
export default function globalSetup(config: FullConfig) {
  delete process.env[GUARD_FLAG];
  assertSafeE2ETarget({
    appSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    baseUrls: config.projects.map((project) => project.use.baseURL),
  });
  process.env[GUARD_FLAG] = "1";
}
