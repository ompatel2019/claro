/**
 * Refuses to let E2E fixtures touch a Supabase project that is not local or an
 * explicitly allow-listed test project (E2E_TEST_SUPABASE_REFS, comma-separated
 * project refs). Prevents fixtures from writing to production.
 */
export function assertTestSupabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL is not set.");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (isLocalHost(host)) return url;
  const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
  if (ref && list(process.env.E2E_TEST_SUPABASE_REFS).includes(ref)) return url;
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

/**
 * Playwright globalSetup check, run before any spec can sign in or write.
 * Credential-free runs (CI, offline mocks) pass untouched; with any credential
 * set, the Supabase URL must pass assertTestSupabaseUrl and a remote
 * E2E_BASE_URL must be an origin listed in E2E_TEST_BASE_URLS.
 */
export function assertSafeE2ETarget(env: NodeJS.ProcessEnv = process.env) {
  if (!CREDENTIALS.some((name) => env[name])) return;
  assertTestSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const base = env.E2E_BASE_URL;
  if (!base) return;
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    throw new Error("E2E: E2E_BASE_URL is not a valid URL.");
  }
  if (isLocalHost(origin.hostname)) return;
  const allowed = list(env.E2E_TEST_BASE_URLS).flatMap((item) => {
    try {
      return [new URL(item).origin];
    } catch {
      return [];
    }
  });
  if (origin.origin !== "null" && allowed.includes(origin.origin)) return;
  throw new Error(
    `E2E: refusing to sign in against ${origin.host}. Use a local app or add its origin to E2E_TEST_BASE_URLS.`,
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
