import "server-only";
import { studentMarking } from "./feedback";
import { admin } from "@/utils/supabase/admin";
import {
  AlreadyMarking,
  MARKER,
  markWritten,
  STALE_CLAIM_MS,
} from "@/lib/marking/engine";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { assessOwnCriteria } from "./marking/own-criteria";
import { ownQuestionSchema } from "./single-check";

/** Own checks use only the student’s validated rubric, without tutor examples. */
export async function markOwnCheck(
  id: string,
  userId: string,
  config: unknown,
) {
  const question = ownQuestionSchema.parse(
    (config as { question: unknown }).question,
  );
  const assessment = assessOwnCriteria(question);
  return markCheck(
    id,
    userId,
    {
      id: `single:${id}`,
      type: question.marks > 8 ? "extended" : "short",
      marks: question.marks,
      stem: question.stem,
      stimulus: null,
      criteria: assessment.ok ? assessment.criteria : [],
      guideline_notes:
        "Mark strictly against the student’s parsed criteria and available marks. Apply every supplied restriction and cap. Do not invent criteria or award marks outside these bands.",
      restrictions: assessment.ok ? assessment.restrictions : undefined,
      sample_answer: null,
      source: "Student's own question — estimated mark",
    },
    assessment,
  );
}

/** Bank singles use the identical engine question shape and blind-check pipeline. */
export async function markBankCheck(
  id: string,
  userId: string,
  questionId: string,
) {
  const { data: question } = await admin()
    .from("questions")
    .select(
      "id,type,marks,stem,stimulus,criteria,guideline_notes,sample_answer,source",
    )
    .eq("id", questionId)
    .single()
    .throwOnError();
  return markCheck(id, userId, question as MarkableQuestion);
}

async function markCheck(
  id: string,
  userId: string,
  question: MarkableQuestion,
  ownAssessment?: ReturnType<typeof assessOwnCriteria>,
) {
  const db = admin();
  const { data: a } = await db
    .from("attempts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single()
    .throwOnError();
  if (a.status === "marked") return a;
  const stale = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: claimed } = await db
    .from("attempts")
    .update({ status: "marking", claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .or(
      `status.in.(pending,transcribed,failed),and(status.eq.marking,claimed_at.lt.${stale})`,
    )
    .select("id")
    .throwOnError();
  if (!claimed?.length) throw new AlreadyMarking();
  try {
    if (ownAssessment && !ownAssessment.ok) {
      const { data } = await db
        .from("attempts")
        .update({
          mark: null,
          max_marks: question.marks,
          band: null,
          check_status: "skipped",
          marked_by_model: "deterministic",
          feedback: {
            note: ownAssessment.message,
            confidence: "low",
            unreliable_reason: ownAssessment.reason,
          },
          status: "marked",
          marked_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single()
        .throwOnError();
      return data;
    }
    const answer = a.transcript ?? a.answer_text ?? "";
    if (!answer.trim()) {
      const { data } = await db
        .from("attempts")
        .update({
          mark: 0,
          max_marks: question.marks,
          band: null,
          feedback: { note: "No answer" },
          check_status: "skipped",
          marked_by_model: "deterministic",
          status: "marked",
          marked_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single()
        .throwOnError();
      return data;
    }
    const { check, ...marked } = await (ownAssessment
      ? markWritten(
          question,
          answer,
          userId,
          undefined,
          undefined,
          [],
          async () => [],
        )
      : markWritten(question, answer, userId));
    if (check.status === "in_review") {
      const { error } = await db.from("mark_reviews").insert({
        attempt_id: id,
        user_id: userId,
        reason: "check_disagreed",
        ai_mark: check.marks[0],
        ai_model: MARKER.model,
        check_mark: check.marks[1],
        check_model: MARKER.model,
        check_notes: `Reconciling pass: ${check.marks[2]}`,
      });
      if (error && error.code !== "23505") throw error;
    }
    const { data } = await db
      .from("attempts")
      .update({
        ...studentMarking(marked),
        feedback: {
          ...studentMarking(marked).feedback,
          ...(ownAssessment && { confidence: "estimate" }),
        },
        max_marks: question.marks,
        check_status: check.status,
        marked_by_model: MARKER.model,
        status: "marked",
        marked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single()
      .throwOnError();
    return data;
  } catch (error) {
    await db.from("attempts").update({ status: "failed" }).eq("id", id);
    throw error;
  }
}
