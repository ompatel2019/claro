import { randomUUID } from "node:crypto";
import { adminClient, cleanupSessions } from "../helpers";
import { DEFAULTS } from "../../src/lib/sprint";

/** Isolated synthetic student; never changes a real student's review history. */
export async function disputeStudent(count = 9) {
  const db = adminClient()!;
  const email = `dispute-${randomUUID()}@example.com`;
  const password = `Synthetic-${randomUUID()}`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Synthetic dispute student" },
  });
  if (error) throw error;
  const userId = data.user.id;
  const sessions: string[] = [];
  const attempts: string[] = [];
  const cleanup = async () => {
    await db.from("mark_reviews").delete().eq("user_id", userId).throwOnError();
    await cleanupSessions(sessions);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
  };
  try {
    await db
      .from("profiles")
      .update({ year_level: 12 })
      .eq("id", userId)
      .throwOnError();
    const { data: questions } = await db
      .from("questions")
      .select("id,marks")
      .eq("type", "short")
      .eq("status", "live")
      .limit(1)
      .throwOnError();
    const question = questions?.[0];
    if (!question) throw new Error("Needs a live short question");
    for (let index = 0; index < count; index++) {
      const { data: s } = await db
        .from("sessions")
        .insert({
          user_id: userId,
          kind: "sprint",
          config: { ...DEFAULTS, mode: "short", timed: false },
          finished_at: new Date().toISOString(),
          score: 1,
          max_score: question.marks,
          summary: { strengths: [], improvements: [], next_steps: [] },
        })
        .select("id")
        .single()
        .throwOnError();
      sessions.push(s!.id);
      const { data: a } = await db
        .from("attempts")
        .insert({
          user_id: userId,
          session_id: s!.id,
          question_id: question.id,
          position: 1,
          status: "marked",
          check_status: "agreed",
          mark: 1,
          max_marks: question.marks,
          marked_at: new Date().toISOString(),
          answer_text: "Synthetic practice answer about inflation.",
          feedback: { comments: [], justification: "Synthetic fixture." },
        })
        .select("id")
        .single()
        .throwOnError();
      attempts.push(a!.id);
    }
    return { userId, email, password, sessions, attempts, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
