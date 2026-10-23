import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Pen, PortalIcon } from "@/components/icons";
import {
  studentMarking,
  markingState,
  markLabel,
  type ReviewRow,
} from "@/lib/feedback";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { bankQuestions, remainingChecks } from "@/lib/single-check-data";
import { dateLabel, scoreTone, type Topic } from "@/lib/practice";
import { type OwnQuestion } from "@/lib/single-check";
import { PageHeader } from "@/components/claro/layout";
import { MarkMyAnswer } from "@/components/mark-my-answer";

export const metadata = pageMetadata("Mark my answer");

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ question?: string }>;
}) {
  const { question } = await searchParams;
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
        "id,config,score,max_score,started_at,finished_at,attempts(status,check_status,mark,max_marks,feedback,question:questions(stem,topic_id))",
      )
      .eq("user_id", user.id)
      .eq("kind", "single")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);
  if (topics.error || recent.error)
    throw new Error("Couldn't load your checks.");
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Mark my answer"
        eyebrow="Homework, a past paper or a practice answer: anything you wrote yourself"
      />
      <MarkMyAnswer
        questions={questions}
        initialQuestionId={question}
        defaultQuestionId={questions.find((q) => q.type !== "mcq")?.id}
        topics={topics.data as Topic[]}
        userId={user.id}
        left={left}
        allowOwnQuestion={allowOwnQuestion}
        allowAutofill={
          allowOwnQuestion &&
          process.env.ENABLE_OWN_QUESTION_AUTOFILL === "true"
        }
      />
      <section className="home-card" aria-labelledby="recent-marked-title">
        <div className="home-card-head">
          <div>
            <h2 id="recent-marked-title">Recently marked</h2>
            <p>Your last answers, with feedback</p>
          </div>
          <Link className="home-row-link" href="/student/activity?kind=single">
            All in Activity
            <PortalIcon strokeWidth={1.5} name="arrow-right" size={16} />
          </Link>
        </div>
        {recent.data.length ? (
          <ul className="home-marked-list">
            {recent.data.map((s) => {
              const config = s.config as { question?: OwnQuestion };
              const attempts = s.attempts as unknown as {
                status: string;
                check_status: string;
                question: { stem: string; topic_id: string | null } | null;
                mark: number | null;
                max_marks: number | null;
                feedback: ReviewRow["feedback"];
              }[];
              const a = attempts[0] ? studentMarking(attempts[0]) : undefined;
              const title = !s.finished_at
                ? "Unsubmitted answer"
                : (config.question?.stem ??
                  a?.question?.stem ??
                  "Mark my answer");
              const state = a ? markingState(a) : "marking";
              const max = a?.max_marks ?? config.question?.marks ?? 0;
              const scored =
                !!s.finished_at &&
                !!a &&
                ["marked", "in_review", "reviewed"].includes(state) &&
                a.mark != null &&
                max > 0 &&
                a.feedback?.confidence !== "low";
              const tone = scored ? scoreTone((100 * a.mark!) / max) : null;
              const label = !s.finished_at
                ? "Draft · not submitted"
                : state === "marking"
                  ? "Marking…"
                  : state === "failed"
                    ? "Couldn't mark"
                    : state === "unreadable"
                      ? "Couldn't read photo"
                      : tone === "success"
                        ? "Earned"
                        : tone === "warning"
                          ? "Partly there"
                          : tone === "destructive"
                            ? "Missed"
                            : a
                              ? markLabel({ ...a, marks: max })
                              : "In progress";
              const topic = topics.data.find(
                (t) =>
                  t.id === (a?.question?.topic_id ?? config.question?.topic_id),
              );
              return (
                <li key={s.id}>
                  <Link href={`/student/activity/${s.id}`}>
                    <span className="home-session-score">
                      {scored ? (
                        <>
                          {a.mark}
                          <span className="text-muted-foreground text-xs">
                            /{max}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-semibold">{title}</p>
                      <div className="home-session-meta">
                        <span
                          className={`home-state ${tone ? `home-state-${tone}` : ""}`}
                        >
                          <PortalIcon
                            strokeWidth={1.5}
                            size={14}
                            name={
                              !s.finished_at
                                ? "pen-line"
                                : tone === "success"
                                  ? "check"
                                  : tone === "warning"
                                    ? "circle-half"
                                    : tone === "destructive"
                                      ? "x"
                                      : state === "failed" ||
                                          state === "unreadable"
                                        ? "circle-alert"
                                        : "clock"
                            }
                          />
                          {label}
                        </span>
                        {scored && state !== "reviewed" && (
                          <span className="home-state">
                            <PortalIcon
                              strokeWidth={1.5}
                              size={14}
                              name="hourglass"
                            />
                            Provisional
                          </span>
                        )}
                        {s.finished_at && topic && <span>{topic.name}</span>}
                        <span>{dateLabel(s.started_at, true)}</span>
                      </div>
                    </div>
                    <PortalIcon
                      strokeWidth={1.5}
                      name="chevron-right"
                      size={16}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-6 pb-6">
            <EmptyState
              icon={Pen}
              title="No checks yet"
              description="Your last five checks will appear here."
            />
          </div>
        )}
      </section>
      <p className="text-muted-foreground text-xs leading-[17px]">
        Claro&apos;s feedback is AI-assisted and criteria-based. AI can make
        mistakes, so use it alongside your teacher&apos;s guidance.
      </p>
    </div>
  );
}
