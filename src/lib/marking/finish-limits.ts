import "server-only";

import { admin } from "@/utils/supabase/admin";

type FinishAttempt = {
  status: string;
  answer_text: string | null;
  transcript: string | null;
  feedback: { note?: string } | null;
  questions: { type: string };
};

const ATTEMPTS = "status,answer_text,transcript,feedback,questions!inner(type)";

// Match markAttempt's minimum answer and finishSession's writing-summary input.
export function needsAiFinish(attempts: FinishAttempt[]) {
  return attempts.some((a) => {
    if (a.questions.type === "mcq") return false;
    const answer = (a.transcript ?? a.answer_text ?? "").trim();
    return a.status === "marked"
      ? a.feedback?.note !== "No answer" && answer.length > 0
      : answer.split(/\s+/).filter(Boolean).length >= 3;
  });
}

export async function sessionNeedsAi(sessionId: string, userId: string) {
  // Use the engine's visibility, including questions retired during a sprint.
  const { data } = await admin()
    .from("attempts")
    .select(ATTEMPTS)
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .throwOnError();
  return needsAiFinish((data ?? []) as unknown as FinishAttempt[]);
}

export async function dailyAiSprintCount(userId: string, since: string) {
  let count = 0;
  // Page parents: an embedded many-attempt sprint must count only once.
  for (let offset = 0; ; offset += 200) {
    const { data } = await admin()
      .from("sessions")
      .select(`id,attempts!inner(${ATTEMPTS})`)
      .eq("user_id", userId)
      .eq("kind", "sprint")
      .neq("attempts.questions.type", "mcq")
      .gte("finished_at", since)
      .order("id")
      .range(offset, offset + 199)
      .throwOnError();
    const sessions = (data ?? []) as unknown as {
      attempts: FinishAttempt[];
    }[];
    count += sessions.filter((s) => needsAiFinish(s.attempts)).length;
    if (sessions.length < 200) return count;
  }
}
