import { createClient } from "@/utils/supabase/server";

import { finishSession } from "@/lib/marking/engine";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
} from "@/lib/ai/rate-limit";
import { sydneyDayStart } from "@/lib/single-check";
import {
  dailyAiSprintCount,
  sessionNeedsAi,
} from "@/lib/marking/finish-limits";

// Even 200 minimum-size written sprints exceed a normal day's study.
const DAILY_WRITTEN_SPRINT_LIMIT = 200;

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const { data: session } = await supabase
    .from("sessions")
    .select("kind,config,started_at,finished_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session || !["sprint", "flashcards", "single"].includes(session.kind))
    return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.kind === "single")
    return Response.json(
      { error: "Submit this check from Mark my answer." },
      { status: 409 },
    );
  try {
    // Inspect actual attempts: even mixed sessions can finish without paid work.
    if (
      session.kind === "sprint" &&
      !session.finished_at &&
      (await sessionNeedsAi(id, user.id))
    ) {
      const { data: profile, error: roleError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (roleError) throw roleError;
      const limited = await assertStudentAiRateLimit({
        userId: user.id,
        role: profile?.role ?? "student",
      });
      if (!limited.ok) return rateLimitedResponse(limited);
      if (profile?.role !== "admin") {
        const count = await dailyAiSprintCount(user.id, sydneyDayStart());
        if (count >= DAILY_WRITTEN_SPRINT_LIMIT)
          return rateLimitedResponse({
            ok: false,
            error: "You've reached today's sprint limit. Try again tomorrow.",
            retryAfterSec: 86400,
          });
      }
    }
    const finished = await finishSession(id);
    return Response.json({
      score: finished.score,
      max_score: finished.max_score,
      summary: finished.summary,
      finished: true,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not finish session. Your answers are still saved. Please try again.",
      },
      { status: 500 },
    );
  }
}
