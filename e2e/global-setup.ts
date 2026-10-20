import type { FullConfig } from "@playwright/test";
import { assertSafeE2ETarget, GUARD_FLAG } from "./guard";

/**
 * Aborts the whole run before any spec signs in against a non-test target.
 * Checks the app's Supabase URL (a mock config's metadata.appSupabaseUrl, else
 * the runner's NEXT_PUBLIC_SUPABASE_URL, which a Playwright-started app server
 * also gets since it overrides .env files) and each project's resolved baseURL.
 */
export default function globalSetup(config: FullConfig) {
  delete process.env[GUARD_FLAG];
  assertSafeE2ETarget({
    appSupabaseUrl:
      typeof config.metadata.appSupabaseUrl === "string"
        ? config.metadata.appSupabaseUrl
        : process.env.NEXT_PUBLIC_SUPABASE_URL,
    baseUrls: config.projects.map((project) => project.use.baseURL),
  });
  process.env[GUARD_FLAG] = "1";
  // Clear the flag when the run ends, so a later run in the same process (UI/watch mode)
  // can't inherit a stale verification if its next setup never gets to run.
  return () => {
    delete process.env[GUARD_FLAG];
  };
}
