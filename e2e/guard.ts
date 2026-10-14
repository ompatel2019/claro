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
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return url;
  const allowed = (process.env.E2E_TEST_SUPABASE_REFS ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);
  const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
  if (ref && allowed.includes(ref)) return url;
  throw new Error(
    `E2E: refusing to run against ${host}. Use a local Supabase or add a test project ref to E2E_TEST_SUPABASE_REFS.`,
  );
}
