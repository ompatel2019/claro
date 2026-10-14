import { createClient } from "@supabase/supabase-js";
import { adminClient, cleanupSessions } from "../helpers";

/** Temporary synthetic bank: 12 MCs, 8/5/4-mark shorts and one excluded essay. */
export async function seedSprintBank() {
  const db = adminClient()!;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const subtopic = `t1-split-${suffix}`;
  const ids: string[] = [];
  const { error: topicError } = await db.from("topics").insert({
    id: subtopic,
    parent_id: "t1",
    name: "Synthetic sprint split",
    sort: 99,
  });
  if (topicError) throw topicError;
  const row = (type: string, marks: number, index: number) => {
    const id = `split-${suffix}-${type}-${index}`;
    ids.push(id);
    return {
      id,
      type,
      marks,
      topic_id: subtopic,
      stem: `Synthetic ${type} question ${id}`,
      source: `Synthetic Q${index}`,
      year: 2026,
      origin: "claro",
      status: "live",
      options:
        type === "mcq"
          ? ["Synthetic A", "Synthetic B", "Synthetic C", "Synthetic D"]
          : null,
      correct_index: type === "mcq" ? 0 : null,
      criteria: type === "mcq" ? null : [],
    };
  };
  const questions = [
    ...Array.from({ length: 12 }, (_, i) => row("mcq", 1, i + 1)),
    ...[8, 5, 4].map((marks, i) => row("short", marks, i + 1)),
    row("extended", 20, 1),
  ];
  let historyId: string | undefined;
  const cleanup = async () => {
    if (historyId) await cleanupSessions([historyId]);
    const { error: questionError } = await db
      .from("questions")
      .delete()
      .in("id", ids);
    if (questionError) throw questionError;
    const { error } = await db.from("topics").delete().eq("id", subtopic);
    if (error) throw error;
  };
  try {
    const { error } = await db.from("questions").insert(questions);
    if (error) throw error;
    const student = await sprintStudentClient();
    const {
      data: { user },
      error: authError,
    } = await student.auth.getUser();
    if (authError || !user)
      throw authError ?? new Error("Missing synthetic student");
    const { data: history, error: historyError } = await db
      .from("sessions")
      .insert({
        user_id: user.id,
        kind: "sprint",
        config: { mode: "short", topics: ["t1"], subtopics: [subtopic] },
        finished_at: new Date().toISOString(),
        score: 9,
        max_score: 9,
      })
      .select("id")
      .single();
    if (historyError) throw historyError;
    historyId = history!.id;
    // Prefer-new ranks the unseen 8-mark question before the seen 5 + 4 pair.
    // A greedy selector undershoots; the reachable-total selector must find 9.
    const { error: attemptError } = await db.from("attempts").insert(
      [5, 4].map((marks, i) => ({
        user_id: user.id,
        session_id: historyId,
        question_id: questions.find(
          (q) => q.type === "short" && q.marks === marks,
        )!.id,
        position: i + 1,
        status: "marked",
        answer_text: "Synthetic history answer",
        mark: marks,
        max_marks: marks,
      })),
    );
    if (attemptError) throw attemptError;
    return { subtopic, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
export async function sprintStudentClient() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await db.auth.signInWithPassword({
    email: process.env.STUDENT_EMAIL!,
    password: process.env.STUDENT_PASSWORD!,
  });
  if (error) throw error;
  return db;
}
