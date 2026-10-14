import "server-only";
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
    .select("*")
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
  const rows = (attempts ?? []) as unknown as Attempt[];
  const checked =
    !session.finished_at && session.config?.feedback === "each"
      ? rows.filter(
          (a) =>
            a.status === "marked" &&
            a.question.type !== "mcq" &&
            a.feedback?.note !== "No answer",
        )
      : [];
  if (checked.length) {
    // Model answers for written answers already checked (§3.3); students
    // cannot select questions.sample_answer, so read it server-side.
    const { data: refs, error: refError } = await admin()
      .from("questions")
      .select("id, sample_answer")
      .in(
        "id",
        checked.map((a) => a.question_id),
      );
    if (refError) throw new Error("Could not load your questions.");
    const byId = new Map((refs ?? []).map((q) => [q.id, q.sample_answer]));
    for (const a of checked) a.sample_answer = byId.get(a.question_id) ?? null;
  }
  return {
    session: session as Session,
    attempts: examOrder(rows),
    profile,
  };
}
