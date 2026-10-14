// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTestSupabaseUrl } from "./guard";

describe("assertTestSupabaseUrl", () => {
  beforeEach(() => {
    vi.stubEnv("E2E_TEST_SUPABASE_REFS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["http://localhost:54321", "http://127.0.0.1:54321"])(
    "allows local Supabase at %s",
    (url) => {
      expect(assertTestSupabaseUrl(url)).toBe(url);
    },
  );

  it("allows an explicitly listed project ref", () => {
    vi.stubEnv("E2E_TEST_SUPABASE_REFS", "otherref, testref ,");
    const url = "https://testref.supabase.co";
    expect(assertTestSupabaseUrl(url)).toBe(url);
  });

  it("refuses a remote project that is not listed", () => {
    expect(() => assertTestSupabaseUrl("https://prodref.supabase.co")).toThrow(
      "refusing to run against prodref.supabase.co",
    );
  });

  it("refuses a lookalike host even when its apparent ref is listed", () => {
    vi.stubEnv("E2E_TEST_SUPABASE_REFS", "x");
    expect(() => assertTestSupabaseUrl("https://x.supabase.co.evil.com")).toThrow(
      "refusing to run against x.supabase.co.evil.com",
    );
  });

  it("throws when the URL is unset", () => {
    expect(() => assertTestSupabaseUrl(undefined)).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL is not set",
    );
  });

  it("throws when the URL is invalid", () => {
    expect(() => assertTestSupabaseUrl("not a URL")).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL",
    );
  });
});
