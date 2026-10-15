import { z } from "zod";
import { studentMarking } from "@/lib/feedback";
import { readMcqExplanation } from "@/lib/mcq-explanation";
import { withAttemptUsage } from "@/lib/ai/usage-context";
import { singleSlotIds } from "@/lib/single-check";
import { markOwnCheck, markBankCheck } from "@/lib/single-check-marking";
import { BUDGET_USD } from "@/lib/ai/prices";
import {
  AlreadyMarking,
  markAttempt,
  rescoreSession,
} from "@/lib/marking/engine";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
} from "@/lib/ai/rate-limit";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 240;

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
  const { data: attempt } = await supabase
    .from("attempts")
    .select(
      "session_id, question_id, session:sessions(finished_at, config, kind, started_at), question:questions(type)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  // Embedded to-one relations; typed loosely without generated DB types.
  const { session, question } = attempt as unknown as {
    session: {
      finished_at: string | null;
      kind: string;
      started_at: string;
      config: { feedback?: string } | null;
    };
    question: { type: string } | null;
  };
  async function singleFailure(message: string) {
    if (session.kind !== "single") return;
    await admin()
      .from("attempts")
      .update({ status: "failed", feedback: { error: message } })
      .eq("id", id)
      .eq("user_id", user!.id)
      .in("status", ["pending", "transcribed", "failed"])
      .throwOnError();
  }
  if (!session || !["sprint", "single"].includes(session.kind))
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  if (
    session.kind === "single" &&
    !attempt.question_id &&
    process.env.ENABLE_OWN_QUESTION_MARKING !== "true"
  )
    return Response.json(
      {
        error:
          "Own-question marking is currently unavailable. Choose a question from the Claro bank.",
      },
      { status: 403 },
    );
  const finished = Boolean(session.finished_at);
  if (session.kind === "single") {
    if (!finished)
      return Response.json(
        { error: "Submit your check before marking." },
        { status: 409 },
      );
    if (
      !session.started_at ||
      !(await singleSlotIds(user.id, new Date(session.started_at))).includes(
        attempt.session_id,
      )
    )
      return Response.json({ error: "Check not found" }, { status: 404 });
  }
  // Check-as-you-go sprints (§3.3) mark and reveal one answer before finish.
  const checkMode = !finished && session.config?.feedback === "each";
  if (question?.type === "mcq" && !finished && !checkMode)
    return Response.json(
      { error: "Multiple-choice answers are marked when you finish" },
      { status: 409 },
    );
  if (question?.type !== "mcq") {
    const limited = await assertStudentAiRateLimit({ userId: user.id });
    if (!limited.ok) {
      await singleFailure(limited.error);
      return rateLimitedResponse(limited);
    }
  }
  try {
    if (question?.type !== "mcq") {
      const { data: spent, error: spendError } = await admin().rpc("ai_spend");
      if (spendError) throw spendError;
      if (Number(spent) >= BUDGET_USD) {
        const error =
          "Marking is paused right now. Your answer is saved; try again later.";
        await singleFailure(error);
        return Response.json({ error }, { status: 503 });
      }
    }
    const { mark, max_marks, band, feedback, status } = await withAttemptUsage(
      id,
      async () =>
        session.kind === "single"
          ? attempt.question_id
            ? await markBankCheck(id, user.id, attempt.question_id)
            : await markOwnCheck(id, user.id, session.config)
          : await markAttempt(id),
    );
    if (feedback?.note === "No answer")
      await admin()
        .from("attempts")
        .update({ check_status: "skipped" })
        .eq("id", id)
        .eq("user_id", user.id)
        .throwOnError();
    if (finished) {
      if (session.kind === "single") {
        await admin()
          .from("sessions")
          .update({ score: mark, max_score: max_marks })
          .eq("id", attempt.session_id)
          .eq("user_id", user.id)
          .throwOnError();
      } else await rescoreSession(attempt.session_id);
    }
    // The answer is locked now, so the explanation (MCQ) or model answer
    // (written) can be shown with the mark. Students cannot read these columns.
    const reference =
      checkMode &&
      attempt.question_id &&
      (question?.type === "mcq" ||
        (status === "marked" && feedback?.note !== "No answer"))
        ? (
            await admin()
              .from("questions")
              .select("explanation, sample_answer")
              .eq("id", attempt.question_id)
              .single()
          ).data
        : null;
    const explanation =
      question?.type === "mcq" ? reference?.explanation : null;
    const sample_answer =
      question?.type !== "mcq" &&
      status === "marked" &&
      feedback?.note !== "No answer"
        ? reference?.sample_answer
        : null;
    const structuredExplanation = readMcqExplanation(explanation);
    return Response.json({
      mark,
      max_marks,
      band,
      feedback: studentMarking({ feedback }).feedback,
      status,
      ...(explanation ? { explanation } : {}),
      ...(sample_answer ? { sample_answer } : {}),
      ...(structuredExplanation
        ? { structured_explanation: structuredExplanation }
        : {}),
      ...(feedback?.correct_index != null
        ? { correct_index: feedback.correct_index }
        : {}),
    });
  } catch (error) {
    if (error instanceof AlreadyMarking)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "AI budget reached") {
      await singleFailure(
        "Marking is paused right now. Your answer is saved; try again later.",
      );
      return Response.json(
        {
          error:
            "Marking is paused right now. Your answer is saved; try again later.",
        },
        { status: 503 },
      );
    }
    const ownAutofill =
      session.kind === "single" &&
      !attempt.question_id &&
      process.env.ENABLE_OWN_QUESTION_AUTOFILL === "true";
    const message = ownAutofill
      ? "Couldn't generate guidelines or mark this answer. Your answer is saved. Please retry."
      : "We couldn't mark this one. Retry.";
    await singleFailure(message);
    console.error(error);
    return Response.json(
      { error: ownAutofill ? message : "Could not mark answer" },
      { status: 500 },
    );
  }
}

const sprintAnswerPatch = z
  .object({
    answer_text: z.string().max(100_000).nullable().optional(),
    transcript: z.string().max(100_000).nullable().optional(),
    image_paths: z.array(z.string()).max(8).nullable().optional(),
    flagged: z.boolean().optional(),
  })
  .strict();

// End-feedback sprint answers stay editable while their marks are prepared.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const parsed = sprintAnswerPatch.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid answer" }, { status: 400 });
  for (let retry = 0; retry < 3; retry++) {
    const { data: row, error } = await admin()
      .from("attempts")
      .select(
        "answer_text,transcript,image_paths,status,claimed_at,session:sessions(kind,config,finished_at),question:questions(type)",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error)
      return Response.json({ error: "Could not save answer" }, { status: 500 });
    if (!row)
      return Response.json({ error: "Attempt not found" }, { status: 404 });
    const attempt = row as unknown as {
      answer_text: string | null;
      transcript: string | null;
      image_paths: string[] | null;
      status: string;
      claimed_at: string | null;
      session: {
        kind: string;
        config: { feedback?: string } | null;
        finished_at: string | null;
      };
      question: { type: string } | null;
    };
    if (
      attempt.session?.kind !== "sprint" ||
      attempt.session.finished_at ||
      attempt.session.config?.feedback === "each" ||
      attempt.question?.type === "mcq" ||
      !attempt.question
    )
      return Response.json(
        { error: "This answer is no longer editable" },
        { status: 409 },
      );
    const patch = parsed.data;
    const changed = (
      ["answer_text", "transcript", "image_paths"] as const
    ).some(
      (key) =>
        key in patch &&
        JSON.stringify(patch[key]) !== JSON.stringify(attempt[key]),
    );
    let update = admin()
      .from("attempts")
      .update({
        ...patch,
        ...(changed
          ? {
              status: "pending",
              claimed_at: new Date(
                Math.max(
                  Date.now(),
                  new Date(attempt.claimed_at ?? 0).getTime() + 1,
                ),
              ).toISOString(),
              mark: null,
              max_marks: null,
              band: null,
              feedback: null,
              marked_at: null,
              check_status: "skipped",
              marked_by_model: null,
            }
          : {}),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", attempt.status);
    // Compare the snapshot so a completed mark or another save cannot be overwritten.
    for (const key of ["answer_text", "transcript", "claimed_at"] as const)
      update =
        attempt[key] === null
          ? update.is(key, null)
          : update.eq(key, attempt[key]);
    const { data, error: saveError } = await update.select("id");
    if (saveError)
      return Response.json({ error: "Could not save answer" }, { status: 500 });
    if (data?.length) return Response.json({ saved: true });
  }
  return Response.json(
    { error: "Answer changed while saving. Please retry." },
    { status: 409 },
  );
}
