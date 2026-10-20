import "server-only";
import type { admin } from "@/utils/supabase/admin";

/** Call only after authorization; preserve the caller's duplicate and error policies. */
export async function lookupAuthUsers(
  db: ReturnType<typeof admin>,
  ids: string[],
  now: number,
  {
    firstMatch = false,
    errorMessage,
  }: { firstMatch?: boolean; errorMessage?: string } = {},
) {
  const wanted = new Set(ids);
  const users = new Map<string, { email: string; blocked: boolean }>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw errorMessage ? new Error(errorMessage) : error;
    for (const user of data.users) {
      if (!wanted.has(user.id) || (firstMatch && users.has(user.id))) continue;
      const until = (user as { banned_until?: string | null }).banned_until;
      users.set(user.id, {
        email: user.email ?? "",
        blocked: !!until && Date.parse(until) > now,
      });
    }
    if (data.users.length < 1000 || users.size === wanted.size) break;
  }
  return users;
}
