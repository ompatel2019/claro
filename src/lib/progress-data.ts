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

/**
 * The student's own marked written answers in finished sessions (RLS: own rows),
 * newest first, reading only the marker's comments. Null when unavailable.
 */
export const loadMarkedComments = cache(
  async (
    userId: string,
    from: string | null,
  ): Promise<MarkedComments[] | null> => {
    const db = await createClient();
    let q = db
      .from("attempts")
      .select(
        "marked_at,comments:feedback->comments,sessions!inner(finished_at)",
      )
      .eq("user_id", userId)
      .eq("status", "marked")
      .not("feedback->comments", "is", null)
      .not("sessions.finished_at", "is", null);
    // A day early in UTC covers Sydney's offset; the exact day is checked below.
    if (from) q = q.gte("marked_at", addDays(from, -1));
    const { data, error } = await q
      .order("marked_at", { ascending: false })
      .limit(300);
    if (error || !data) return null;
    return (data as { marked_at: string | null; comments: unknown }[])
      .filter((r) => !from || (r.marked_at && sydneyDay(r.marked_at) >= from))
      .map(({ marked_at, comments }) => ({ marked_at, comments }));
  },
);

/**
 * Finished practice sessions' marks (score_history, RLS: own rows) in range,
 * for the practice average chart. Flashcard decks are not marked answers.
 */
export const loadSessionScores = cache(
  async (
    userId: string,
    from: string | null,
  ): Promise<SessionScore[] | null> => {
    const db = await createClient();
    let q = db
      .from("score_history")
      .select("finished_at,score,max_score")
      .eq("user_id", userId)
      .neq("kind", "flashcards")
      .gt("max_score", 0);
    if (from) q = q.gte("finished_at", addDays(from, -1));
    const { data, error } = await q
      .order("finished_at", { ascending: false })
      .limit(1000);
    if (error || !data) return null;
    return (data as SessionScore[]).filter(
      (r) => !from || (r.finished_at && sydneyDay(r.finished_at) >= from),
    );
  },
);
