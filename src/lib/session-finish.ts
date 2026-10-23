import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { finishSession } from "@/lib/marking/engine";
import {
  assertStudentAiRateLimit,
  withDeferredAiUsageReservation,
} from "@/lib/ai/rate-limit";
import {
  reserveDailyAiSprint,
  sessionNeedsAi,
} from "@/lib/marking/finish-limits";
import { admin } from "@/utils/supabase/admin";

/** Open sprints and decks with no activity for this long are finished (no resume). */
export const IDLE_FINISH_MS = 30 * 60_000;

/** Session kinds a student finishes by leaving; single checks finish from Mark my answer. */
export const LEAVABLE_KINDS = ["sprint", "flashcards"] as const;

/**
 * Finishes one of the student's own sessions under the same AI allowance as the Finish button.
 * Callers pass the verified user id; `db` only reads that user's role.
 */
export async function finishOwnSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
  session: { kind: string; finished_at: string | null },
) {
  let role = "student";
  return withDeferredAiUsageReservation(
    async () => {
      const { data: profile, error } = await db
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      role = profile?.role ?? "student";
      return assertStudentAiRateLimit({ userId, role });
    },
    async () => {
      if (role !== "admin") return reserveDailyAiSprint(userId, sessionId);
    },
    async (ensure) => {
      // Deterministic finishes need no allowance. The provider guard also
      // covers answers saved after this snapshot and the engine's reloads.
      if (
        session.kind === "sprint" &&
        !session.finished_at &&
        (await sessionNeedsAi(sessionId, userId))
      )
        await ensure();
      return finishSession(sessionId);
    },
  );
}

const running = new Set<string>();

/** True once an open session has had no activity for 30 minutes. */
export function sessionIdle(
  lastActiveAt: string | null | undefined,
  now = Date.now(),
) {
  return (
    !!lastActiveAt && now - new Date(lastActiveAt).getTime() >= IDLE_FINISH_MS
  );
}

/**
 * Finishes the student's open sprints and decks: all of them except `keep` when a new session
 * starts, `only` one reopened session, or those idle for 30 minutes on a later visit. Answered questions are marked and
 * unanswered ones score 0. One failure (e.g. a rate limit) leaves that session for the next sweep.
 */
export async function finishOpenSessions(
  userId: string,
  opts: { keep?: string; only?: string; idleOnly?: boolean } = {},
) {
  const db = admin();
  // Service role: every read is pinned to the verified caller's user id.
  const { data, error } = await db
    .from("sessions")
    .select("id,kind,finished_at,last_active_at:session_last_active_at")
    .eq("user_id", userId)
    .in("kind", LEAVABLE_KINDS)
    .is("finished_at", null);
  if (error) throw error;
  const due = (
    (data ?? []) as {
      id: string;
      kind: string;
      finished_at: string | null;
      last_active_at: string;
    }[]
  ).filter(
    (s) =>
      s.id !== opts.keep &&
      (!opts.only || s.id === opts.only) &&
      !running.has(s.id) &&
      (!opts.idleOnly || sessionIdle(s.last_active_at)),
  );
  let finished = 0;
  for (const s of due) {
    running.add(s.id);
    try {
      await finishOwnSession(db, userId, s.id, s);
      finished++;
    } catch (cause) {
      console.error("auto-finish failed; retried on the next visit", cause);
    } finally {
      running.delete(s.id);
    }
  }
  return finished;
}
