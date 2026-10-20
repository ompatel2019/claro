// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeE2ETarget,
  assertTargetVerified,
  assertTestSupabaseUrl,
  GUARD_FLAG,
  hasE2ECredentials,
} from "./guard";

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
  const test = "https://testref.supabase.co";
  const refs = { E2E_TEST_SUPABASE_REFS: "testref" };
  const env = (vars: Record<string, string>) => ({ ...refs, ...vars });
  const local = (url: string | undefined) => ({
    appSupabaseUrl: url,
    baseUrls: ["http://localhost:3000"],
  });

  beforeEach(() => {
    // The ambient allow-list must not leak into an explicit env.
    vi.stubEnv("E2E_TEST_SUPABASE_REFS", "prodref");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets credential-free runs through, whatever the targets", () => {
    expect(() =>
      assertSafeE2ETarget(
        { appSupabaseUrl: prod, baseUrls: ["https://claro.example"] },
        env({ NEXT_PUBLIC_SUPABASE_URL: prod }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSafeE2ETarget({ appSupabaseUrl: undefined, baseUrls: [] }, env({})),
    ).not.toThrow();
  });

  it.each([
    "STUDENT_EMAIL",
    "STUDENT_PASSWORD",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ])("refuses a production app Supabase URL when %s is set", (name) => {
    expect(() =>
      assertSafeE2ETarget(local(prod), env({ [name]: "x" })),
    ).toThrow("refusing to run against prodref.supabase.co");
  });

  it("checks the app and base URLs for a service-key-only run", () => {
    expect(() =>
      assertSafeE2ETarget(
        local(prod),
        env({ SUPABASE_SECRET_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: test }),
      ),
    ).toThrow("refusing to run against prodref.supabase.co");
    expect(() =>
      assertSafeE2ETarget(
        { appSupabaseUrl: test, baseUrls: ["https://claro.example"] },
        env({ SUPABASE_SECRET_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: test }),
      ),
    ).toThrow("refusing to sign in against claro.example");
  });

  it("checks the runner URL separately when the service key is set", () => {
    expect(() =>
      assertSafeE2ETarget(
        local("http://127.0.0.1:54328"),
        env({ SUPABASE_SECRET_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: prod }),
      ),
    ).toThrow("refusing to run against prodref.supabase.co");
    expect(() =>
      assertSafeE2ETarget(
        local("http://127.0.0.1:54328"),
        env({ STUDENT_EMAIL: "x", NEXT_PUBLIC_SUPABASE_URL: prod }),
      ),
    ).not.toThrow();
  });

  it("refuses an unlisted unmanaged app, even on localhost", () => {
    const vars = { STUDENT_EMAIL: "x", E2E_BASE_URL: "http://localhost:3000" };
    expect(() => assertSafeE2ETarget(local(test), env(vars))).toThrow(
      "refusing to sign in against localhost:3000",
    );
    expect(() =>
      assertSafeE2ETarget(
        local(test),
        env({ ...vars, E2E_TEST_BASE_URLS: "http://localhost:3000" }),
      ),
    ).not.toThrow();
  });

  it("uses the supplied allow-list, not the ambient one", () => {
    expect(() =>
      assertSafeE2ETarget(local(test), env({ STUDENT_EMAIL: "x" })),
    ).not.toThrow();
  });

  it("refuses sign-in credentials with no app Supabase URL", () => {
    expect(() =>
      assertSafeE2ETarget(local(undefined), env({ STUDENT_EMAIL: "x" })),
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL is not set");
  });

  it.each(["http://127.0.0.1:54321", test])(
    "allows credentials against %s with a local app",
    (url) => {
      for (const baseUrls of [[], [undefined], ["http://localhost:3104"]])
        expect(() =>
          assertSafeE2ETarget(
            { appSupabaseUrl: url, baseUrls },
            env({
              STUDENT_EMAIL: "x",
              SUPABASE_SECRET_KEY: "x",
              NEXT_PUBLIC_SUPABASE_URL: url,
            }),
          ),
        ).not.toThrow();
    },
  );

  it("refuses a remote app origin that is not listed", () => {
    const target = {
      appSupabaseUrl: test,
      baseUrls: [
        "http://localhost:3000",
        "https://claro-b2c-portal.vercel.app",
      ],
    };
    expect(() =>
      assertSafeE2ETarget(target, env({ STUDENT_EMAIL: "x" })),
    ).toThrow("refusing to sign in against claro-b2c-portal.vercel.app");
    expect(() =>
      assertSafeE2ETarget(
        target,
        env({
          STUDENT_EMAIL: "x",
          E2E_TEST_BASE_URLS: "https://claro-b2c-portal.vercel.app.evil.com",
        }),
      ),
    ).toThrow("refusing to sign in");
  });

  it("allows a listed remote app origin", () => {
    expect(() =>
      assertSafeE2ETarget(
        {
          appSupabaseUrl: test,
          baseUrls: ["https://preview.example.com/student"],
        },
        env({
          ADMIN_EMAIL: "x",
          E2E_TEST_BASE_URLS:
            "https://other.example.com, https://preview.example.com/",
        }),
      ),
    ).not.toThrow();
  });

  it("refuses an invalid base URL when credentials are set", () => {
    expect(() =>
      assertSafeE2ETarget(
        { appSupabaseUrl: "http://localhost:54321", baseUrls: ["not a URL"] },
        env({ STUDENT_EMAIL: "x" }),
      ),
    ).toThrow("the base URL is not a valid URL");
  });
});

describe("assertTargetVerified", () => {
  it("refuses to sign in unless globalSetup passed", () => {
    expect(() => assertTargetVerified({})).toThrow(
      "production-target guard in globalSetup did not pass",
    );
    expect(() => assertTargetVerified({ [GUARD_FLAG]: "1" })).not.toThrow();
  });
});

describe("hasE2ECredentials", () => {
  it("detects any sign-in or service credential", () => {
    expect(hasE2ECredentials({})).toBe(false);
    expect(hasE2ECredentials({ SUPABASE_SECRET_KEY: "x" })).toBe(true);
  });
});

describe("globalSetup", () => {
  it("returns a teardown that clears the verification flag", async () => {
    const { default: globalSetup } = await import("./global-setup");
    const saved = { ...process.env };
    try {
      for (const k of [
        "STUDENT_EMAIL",
        "STUDENT_PASSWORD",
        "ADMIN_EMAIL",
        "ADMIN_PASSWORD",
        "SUPABASE_SECRET_KEY",
      ])
        delete process.env[k];
      const teardown = globalSetup({
        metadata: {},
        projects: [],
      } as unknown as Parameters<typeof globalSetup>[0]);
      expect(process.env[GUARD_FLAG]).toBe("1");
      teardown();
      expect(process.env[GUARD_FLAG]).toBeUndefined();
      expect(() => assertTargetVerified()).toThrow();
    } finally {
      process.env = saved;
    }
  });
});
