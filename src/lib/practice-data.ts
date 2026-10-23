import "server-only";
import { studentMarking } from "./feedback";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import {
  examOrder,
  questionColumns,
  type Session,
  type Attempt,
} from "./practice";
export async function loadSprint(id: string) {
  const profile = await requireProfile();
  const db = await createClient();
  const { data: session, error } = await db
    .from("sessions")
    .select("*,last_active_at:session_last_active_at")
    .eq("id", id)
    .eq("user_id", profile.id)
    .eq("kind", "sprint")
    .maybeSingle();
  if (error) throw new Error("Could not load your session.");
  if (!session) notFound();
  const { data: attempts, error: attemptError } = await db
    .from("attempts")
    .select(`*,question:questions(${questionColumns})`)
    .eq("session_id", id)
    .eq("user_id", profile.id)
    .order("position");
  if (attemptError) throw new Error("Could not load your questions.");
  const rows = examOrder((attempts ?? []) as unknown as Attempt[]);
  // Only locked MC answers in an owned check-mode session may reveal explanations.
  const checkedMcq =
    session.config?.feedback === "each"
      ? rows.filter((a) => a.status === "marked" && a.question.type === "mcq")
      : [];
  const explanations: Record<string, string> = {};
  const checked =
    !session.finished_at && session.config?.feedback === "each"
      ? rows.filter(
          (a) =>
            a.status === "marked" &&
            a.question.type !== "mcq" &&
            a.feedback?.note !== "No answer",
        )
      : [];
  if (checkedMcq.length || checked.length) {
    // Read protected references once, then attach only each eligible field.
    const { data: refs, error: refError } = await admin()
      .from("questions")
      .select("id,explanation,sample_answer")
      .in(
        "id",
        [...checkedMcq, ...checked].map((a) => a.question_id),
      );
    if (refError)
      throw new Error(
        checkedMcq.length
          ? "Could not load your checked explanations."
          : "Could not load your questions.",
      );
    for (const a of checkedMcq) {
      const ref = refs?.find((q) => q.id === a.question_id);
      if (ref?.explanation) explanations[a.id] = ref.explanation;
    }
    const byId = new Map((refs ?? []).map((q) => [q.id, q.sample_answer]));
    for (const a of checked) a.sample_answer = byId.get(a.question_id) ?? null;
  }
  return {
    explanations,
    session: session as Session,
    attempts: rows.map(studentMarking),
    profile,
  };
}
