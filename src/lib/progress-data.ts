import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "./flashcards";
import { addDays } from "./activity";
import { rangeFrom, type ProgressRange, type ProgressData } from "./progress";
import type { MarkedComments, SessionScore } from "./progress-insights";
import { sydneyDay } from "./sydney-day";

export const loadProgress = cache(
  async (range: ProgressRange, today: string): Promise<ProgressData> => {
    const db = await createClient();
    const { data, error } = await db.rpc("student_progress", {
      p_from: rangeFrom(range, today),
      p_to: today,
    });
    if (error || !data) throw new Error("Could not load progress");
    return data as ProgressData;
  },
);
// Sydney's day is shared by all cards in a request.
export const progressToday = cache(() => sydneyToday());

const PAGE = 1000;
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
/** Read every row in pages (PostgREST caps a response), up to `max` rows. */
async function readAll<T>(
  page: (lo: number, hi: number) => Page<T>,
  max: number,
) {
  const rows: T[] = [];
  while (rows.length < max) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return { rows, complete: true };
  }
  return { rows, complete: false };
}
/** Most marked answers whose comments the marker-asks card reads. */
export const MARKED_COMMENTS_MAX = 5000;

/**
 * The student's own marked written answers in finished sessions (RLS: own rows),
 * newest first, reading only the marker's comments. `complete` is false when the
 * range holds more than MARKED_COMMENTS_MAX answers. Null when unavailable.
 */
export const loadMarkedComments = cache(
  async (
    userId: string,
    from: string | null,
  ): Promise<{ rows: MarkedComments[]; complete: boolean } | null> => {
    const db = await createClient();
    const read = await readAll<{ marked_at: string | null; comments: unknown }>(
      (lo, hi) => {
        let q = db
          .from("attempts")
          .select(
            "id,marked_at,comments:feedback->comments,sessions!inner(finished_at)",
          )
          .eq("user_id", userId)
          .eq("status", "marked")
          .not("feedback->comments", "is", null)
          .not("sessions.finished_at", "is", null);
        // A day early in UTC covers Sydney's offset; the exact day is checked below.
        if (from) q = q.gte("marked_at", addDays(from, -1));
        return q
          .order("marked_at", { ascending: false })
          .order("id")
          .range(lo, hi);
      },
      MARKED_COMMENTS_MAX,
    );
    if (!read) return null;
    return {
      complete: read.complete,
      rows: read.rows
        .filter((r) => !from || (r.marked_at && sydneyDay(r.marked_at) >= from))
        .map(({ marked_at, comments }) => ({ marked_at, comments })),
    };
  },
);

/**
 * Finished practice sessions' marks (score_history, RLS: own rows) in range,
 * for the practice average chart, all of them. Flashcard decks are not marked
 * answers. Null when unavailable or past a sanity cap.
 */
export const loadSessionScores = cache(
  async (
    userId: string,
    from: string | null,
  ): Promise<SessionScore[] | null> => {
    const db = await createClient();
    const read = await readAll<SessionScore & { id: string }>((lo, hi) => {
      let q = db
        .from("score_history")
        .select("id,finished_at,score,max_score")
        .eq("user_id", userId)
        .neq("kind", "flashcards")
        .gt("max_score", 0);
      if (from) q = q.gte("finished_at", addDays(from, -1));
      return q
        .order("finished_at", { ascending: false })
        .order("id")
        .range(lo, hi);
    }, 50 * PAGE);
    if (!read?.complete) return null;
    return read.rows
      .filter(
        (r) => !from || (r.finished_at && sydneyDay(r.finished_at) >= from),
      )
      .map(({ finished_at, score, max_score }) => ({
        finished_at,
        score,
        max_score,
      }));
  },
);
