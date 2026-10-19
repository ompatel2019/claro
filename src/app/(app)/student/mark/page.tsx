import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Pen } from "@/components/icons";
import {
  studentMarking,
  markingState,
  markLabel,
  type ReviewRow,
} from "@/lib/feedback";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { bankQuestions, remainingChecks } from "@/lib/single-check-data";
import { dateLabel, type Topic } from "@/lib/practice";
import { type OwnQuestion } from "@/lib/single-check";
import { PageHeader } from "@/components/claro/layout";
import { MarkMyAnswer } from "@/components/mark-my-answer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";

export const metadata = pageMetadata("Mark my answer");

export default async function Page() {
  const allowOwnQuestion = process.env.ENABLE_OWN_QUESTION_MARKING === "true";
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in");
  const [questions, left, topics, recent] = await Promise.all([
    bankQuestions(db),
    remainingChecks(user.id),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db
      .from("sessions")
      .select(
        "id,config,score,max_score,started_at,finished_at,attempts(status,check_status,mark,max_marks,feedback,question:questions(stem))",
      )
      .eq("user_id", user.id)
      .eq("kind", "single")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);
  if (topics.error || recent.error)
    throw new Error("Couldn't load your checks.");
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Mark my answer"
        description={
          allowOwnQuestion
            ? "Bring a question and your answer. Find out what earns your next mark."
            : "Choose a question from the Claro bank and bring your answer. Find out what earns your next mark."
        }
      />
      <MarkMyAnswer
        questions={questions}
        topics={topics.data as Topic[]}
        userId={user.id}
        left={left}
        allowOwnQuestion={allowOwnQuestion}
        allowAutofill={
          allowOwnQuestion &&
          process.env.ENABLE_OWN_QUESTION_AUTOFILL === "true"
        }
      />
      {recent.data.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Recently marked</CardTitle>
            <CardDescription>Your last answers, with feedback</CardDescription>
            <CardAction>
              <Link
                href="/student/activity"
                className="text-muted-foreground text-[13px]"
              >
                All activity ↗
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1">
              {recent.data.map((s) => {
                const config = s.config as { question?: OwnQuestion };
                const attempts = s.attempts as unknown as {
                  status: string;
                  check_status: string;
                  question: { stem: string } | null;
                  mark: number | null;
                  max_marks: number | null;
                  feedback: ReviewRow["feedback"];
                }[];
                const a = attempts[0] ? studentMarking(attempts[0]) : undefined;
                const title =
                  config.question?.stem ??
                  a?.question?.stem ??
                  "Mark my answer";
                const state = a ? markingState(a) : "marking";
                const score = !s.finished_at
                  ? "In progress"
                  : state === "marking"
                    ? "Marking…"
                    : state === "failed"
                      ? "Couldn't mark"
                      : state === "unreadable"
                        ? "Couldn't read photo"
                        : a
                          ? `${markLabel({ ...a, marks: a.max_marks ?? config.question?.marks ?? 0 })}${state === "in_review" ? " · Provisional" : ""}`
                          : "In progress";
                return (
                  <li key={s.id}>
                    <Link
                      href={`/student/activity/${s.id}`}
                      className="hover:bg-accent flex items-center gap-3 rounded-lg py-3 focus-visible:outline-2"
                    >
                      <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                        <Pen className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {title}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {score} · {dateLabel(s.started_at, true)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Recent checks</h2>
          <EmptyState
            icon={Pen}
            title="No checks yet"
            description="Your last five checks will appear here."
          />
        </section>
      )}
    </div>
  );
}
