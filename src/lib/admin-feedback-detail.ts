import "server-only";
import type { createClient } from "@/utils/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Named aliases keep declaration emit from expanding postgrest's select-query
// parser over a generic column string, which exhausted the heap whenever tsc
// computed this file's signature (incremental builds with a stale tsbuildinfo).
declare const feedback: ReturnType<Client["from"]>;
type FeedbackSelect<Columns extends string> = ReturnType<
  typeof feedback.select<Columns>
>;
type SignedUrls = ReturnType<Client["storage"]["from"]>["createSignedUrls"];

export function selectFeedbackRow<Columns extends string>(
  db: Client,
  id: string,
  columns: Columns,
): FeedbackSelect<Columns> {
  return db.from("feedback").select(columns).eq("id", id);
}

export function signFeedbackScreenshots(
  db: Client,
  paths: string[],
): ReturnType<SignedUrls> | null {
  return paths.length
    ? db.storage.from("reports").createSignedUrls(paths, 3600)
    : null;
}
