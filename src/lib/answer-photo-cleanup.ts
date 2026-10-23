"use client";

import { createClient } from "@/utils/supabase/client";
import { withAuthRetry } from "@/lib/auth-client";
import { isAnswerImageKey } from "@/lib/answer-image-key";

// Only enqueue objects after their metadata is saved without them, or when a
// batch fails before any metadata save. Failed deletes survive a page reload.
export async function cleanupAnswerPhotos(
  userId: string,
  paths: string[] = [],
) {
  try {
    const key = `claro-photo-cleanup-${userId}`;
    const queued: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const pending = [...new Set([...queued, ...paths])].filter((path) =>
      isAnswerImageKey(path, userId),
    );
    if (!pending.length) return;
    localStorage.setItem(key, JSON.stringify(pending));
    const db = createClient();
    await withAuthRetry(db, async () => {
      const { error } = await db.storage.from("answers").remove(pending);
      if (error) throw new Error("Photo cleanup failed");
    });
    // Preserve any other cleanup queued while the storage request was in flight.
    const remaining = (
      JSON.parse(localStorage.getItem(key) ?? "[]") as string[]
    ).filter((path) => !pending.includes(path));
    if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
    else localStorage.removeItem(key);
  } catch {
    // Keep the queue for the next background retry. Cleanup never blocks an answer.
  }
}
