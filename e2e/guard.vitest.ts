// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertSafeE2ETarget, assertTestSupabaseUrl } from "./guard";

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
    expect(() =>
      assertTestSupabaseUrl("https://x.supabase.co.evil.com"),
    ).toThrow("refusing to run against x.supabase.co.evil.com");
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

describe("assertSafeE2ETarget", () => {
  const prod = "https://prodref.supabase.co";
  const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars;

  beforeEach(() => {
    vi.stubEnv("E2E_TEST_SUPABASE_REFS", "testref");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets credential-free runs through, whatever the URL", () => {
    expect(() =>
      assertSafeE2ETarget(env({ NEXT_PUBLIC_SUPABASE_URL: prod })),
    ).not.toThrow();
    expect(() => assertSafeE2ETarget(env({}))).not.toThrow();
  });

  it.each([
    "STUDENT_EMAIL",
    "STUDENT_PASSWORD",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "SUPABASE_SECRET_KEY",
  ])("refuses a production Supabase URL when %s is set", (name) => {
    expect(() =>
      assertSafeE2ETarget(env({ [name]: "x", NEXT_PUBLIC_SUPABASE_URL: prod })),
    ).toThrow("refusing to run against prodref.supabase.co");
  });

  it("refuses credentials with no Supabase URL", () => {
    expect(() => assertSafeE2ETarget(env({ STUDENT_EMAIL: "x" }))).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL is not set",
    );
  });

  it.each(["http://127.0.0.1:54321", "https://testref.supabase.co"])(
    "allows credentials against %s with a local app",
    (url) => {
      for (const base of [undefined, "http://localhost:3000"])
        expect(() =>
          assertSafeE2ETarget(
            env({
              STUDENT_EMAIL: "x",
              NEXT_PUBLIC_SUPABASE_URL: url,
              ...(base ? { E2E_BASE_URL: base } : {}),
            }),
          ),
        ).not.toThrow();
    },
  );

  it("refuses a remote app origin that is not listed", () => {
    const vars = {
      STUDENT_EMAIL: "x",
      NEXT_PUBLIC_SUPABASE_URL: "https://testref.supabase.co",
      E2E_BASE_URL: "https://claro-b2c-portal.vercel.app",
    };
    expect(() => assertSafeE2ETarget(env(vars))).toThrow(
      "refusing to sign in against claro-b2c-portal.vercel.app",
    );
    expect(() =>
      assertSafeE2ETarget(
        env({
          ...vars,
          E2E_TEST_BASE_URLS: "https://claro-b2c-portal.vercel.app.evil.com",
        }),
      ),
    ).toThrow("refusing to sign in");
  });

  it("allows a listed remote app origin", () => {
    expect(() =>
      assertSafeE2ETarget(
        env({
          ADMIN_EMAIL: "x",
          NEXT_PUBLIC_SUPABASE_URL: "https://testref.supabase.co",
          E2E_BASE_URL: "https://preview.example.com/student",
          E2E_TEST_BASE_URLS:
            "https://other.example.com, https://preview.example.com/",
        }),
      ),
    ).not.toThrow();
  });

  it("refuses an invalid app URL when credentials are set", () => {
    expect(() =>
      assertSafeE2ETarget(
        env({
          STUDENT_EMAIL: "x",
          NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
          E2E_BASE_URL: "not a URL",
        }),
      ),
    ).toThrow("E2E_BASE_URL is not a valid URL");
  });
});
