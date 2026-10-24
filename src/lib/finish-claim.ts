import "server-only";

import { FINISH_LEASE_MS } from "@/lib/results";
import { admin } from "@/utils/supabase/admin";

export class FinishInProgress extends Error {
  message = "Your answers are already being marked.";
}

/**
 * Claims a sprint's Finish run, so one run marks it at a time across instances. A lease
 * older than FINISH_LEASE_MS belongs to a run that died and is taken over. Returns the
 * claim, or null when the sprint is already finished; throws FinishInProgress otherwise.
 */
export async function claimFinish(sessionId: string, userId: string) {
  const now = Date.now();
  const claim = new Date(now).toISOString();
  const stale = new Date(now - FINISH_LEASE_MS).toISOString();
  const { data: claimed } = await admin()
    .from("sessions")
    .update({ finish_requested_at: claim })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("finished_at", null)
    .or(`finish_requested_at.is.null,finish_requested_at.lt.${stale}`)
    .select("id")
    .throwOnError();
  if (claimed?.length) return claim;
  const { data: session } = await admin()
    .from("sessions")
    .select("finished_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()
    .throwOnError();
  if (session?.finished_at) return null;
  throw new FinishInProgress();
}

/** A failed run hands the sprint back (only its own, still-open claim). */
export async function releaseFinish(sessionId: string, claim: string) {
  await admin()
    .from("sessions")
    .update({ finish_requested_at: null })
    .eq("id", sessionId)
    .eq("finish_requested_at", claim)
    .is("finished_at", null)
    .throwOnError();
}
