/**
 * Refuses to let E2E fixtures touch a Supabase project that is not local or an
 * explicitly allow-listed test project (E2E_TEST_SUPABASE_REFS, comma-separated
 * project refs). Prevents fixtures from writing to production.
 */
export function assertTestSupabaseUrl(
  url: string | undefined,
  refs = process.env.E2E_TEST_SUPABASE_REFS,
): string {
  if (!url) throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL is not set.");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (isLocalHost(host)) return url;
  const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
  if (ref && list(refs).includes(ref)) return url;
  throw new Error(
    `E2E: refusing to run against ${host}. Use a local Supabase or add a test project ref to E2E_TEST_SUPABASE_REFS.`,
  );
}

/** Env vars that let a run sign in or write as a real user or the service role. */
const CREDENTIALS = [
  "STUDENT_EMAIL",
  "STUDENT_PASSWORD",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "SUPABASE_SECRET_KEY",
] as const;

type Env = Record<string, string | undefined>;

/** Set by globalSetup once the target is verified; checked before every sign-in. */
export const GUARD_FLAG = "CLARO_E2E_TARGET_VERIFIED";

export function hasE2ECredentials(env: Env = process.env) {
  return CREDENTIALS.some((name) => env[name]);
}

/** The resolved targets of a run: the app's Supabase URL and every base URL. */
export type E2ETarget = {
  /** NEXT_PUBLIC_SUPABASE_URL the app server gets. */
  appSupabaseUrl: string | undefined;
  baseUrls: (string | undefined)[];
};

/**
 * Playwright globalSetup check, run before any spec can sign in or write.
 * Credential-free runs (CI, offline mocks) pass untouched. With any credential
 * set (sign-in or service key):
 * - the app's Supabase URL must pass assertTestSupabaseUrl;
 * - an unmanaged app (E2E_BASE_URL, even on localhost) must be an origin
 *   listed in E2E_TEST_BASE_URLS, since its env can't be checked from here;
 * - any other remote project baseURL must be listed too.
 */
export function assertSafeE2ETarget(target: E2ETarget, env: Env = process.env) {
  if (!hasE2ECredentials(env)) return;
  assertTestSupabaseUrl(target.appSupabaseUrl, env.E2E_TEST_SUPABASE_REFS);
  const allowed = list(env.E2E_TEST_BASE_URLS).flatMap((item) => {
    try {
      return [new URL(item).origin];
    } catch {
      return [];
    }
  });
  const unmanaged = env.E2E_BASE_URL;
  for (const base of [unmanaged, ...target.baseUrls]) {
    if (!base) continue;
    let origin: URL;
    try {
      origin = new URL(base);
    } catch {
      throw new Error("E2E: the base URL is not a valid URL.");
    }
    if (origin.origin !== "null" && allowed.includes(origin.origin)) continue;
    if (base !== unmanaged && isLocalHost(origin.hostname)) continue;
    throw new Error(
      `E2E: refusing to sign in against ${origin.host}. Let Playwright start the app, or add its origin to E2E_TEST_BASE_URLS.`,
    );
  }
}

/** Refuses to sign in unless globalSetup verified this run's target. */
export function assertTargetVerified(env: Env = process.env) {
  if (env[GUARD_FLAG] !== "1")
    throw new Error(
      "E2E: refusing to sign in: the production-target guard in globalSetup did not pass for this run.",
    );
}

function isLocalHost(host: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
}

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
