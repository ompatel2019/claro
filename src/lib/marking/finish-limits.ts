import "server-only";

import { admin } from "@/utils/supabase/admin";

export async function sessionNeedsAi(sessionId: string, userId: string) {
  const { data, error } = await admin().rpc("session_needs_ai_finish", {
    p_session: sessionId,
    p_user: userId,
  });
  if (error) throw error;
  if (typeof data !== "boolean")
    throw new Error("Invalid AI finish lookup result");
  return data;
}

// The SQL count and pending admission run together under the per-user lock.
export async function reserveDailyAiSprint(userId: string, sessionId: string) {
  const { data, error } = await admin().rpc("reserve_ai_sprint", {
    p_user: userId,
    p_session: sessionId,
  });
  if (error) throw error;
  if (data?.ok === true) {
    if (typeof data.reservationId === "string")
      return { ok: true as const, reservationId: data.reservationId };
    if (data.adminExempt === true || data.alreadyFinished === true)
      return { ok: true as const };
  }
  if (data?.ok === false && data.retryAfterSec === 86400)
    return {
      ok: false as const,
      error: "You've reached today's sprint limit. Try again tomorrow.",
      retryAfterSec: 86400,
    };
  throw new Error("Invalid daily sprint reservation result");
}
