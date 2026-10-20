import "server-only";
import type { createClient } from "@/utils/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export function selectFeedbackRow<Columns extends string>(
  db: Client,
  id: string,
  columns: Columns,
) {
  return db.from("feedback").select(columns).eq("id", id);
}

export function signFeedbackScreenshots(db: Client, paths: string[]) {
  return paths.length
    ? db.storage.from("reports").createSignedUrls(paths, 3600)
    : null;
}
