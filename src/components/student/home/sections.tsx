import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import type { ProgressData } from "@/lib/progress";
import { practiseHref } from "@/lib/progress";
import {
  scoreTone,
  topicNames,
  dateLabel,
  type Session,
  type Topic,
} from "@/lib/practice";
import { Card } from "@/components/ui/card";
import { TryAgain } from "@/components/try-again";
import {
  sessionTitle,
  sessionHref,
  isStudentSession,
} from "@/lib/session-summary";
import {
  nextStepTopic,
  practiceAverage,
  practiceWeek,
  WEEKLY_PRACTICE_GOAL,
} from "@/lib/home";
import type { ActivityDay } from "@/lib/activity";
import { PRACTICE_TARGET } from "@/lib/progress";
import { buttonVariants } from "@/components/ui/button";
import { PenCaret } from "@/components/claro/markup-answer";
import { BarList } from "@/components/claro/data-display";
import { PortalIcon } from "@/components/icons";
export type HomeProgress = Promise<ProgressData | null>;
export type HomeSession = Session & {
  recall?: { knew: number; total: number };
};
export type HomeSessions = Promise<HomeSession[] | null>;

export async function readHomeSessions(userId: string): HomeSessions {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .in("kind", ["sprint", "flashcards", "single"])
      .order("started_at", { ascending: false })
      .limit(3);
    if (error) return null;
    const rows = (data ?? []) as HomeSession[];
    const ids = rows
      .filter((s) => s.kind === "flashcards" && s.finished_at)
      .map((s) => s.id);
    if (ids.length) {
      const reviews: { session_id: string | null; mark: number }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db
          .from("flashcard_reviews")
          .select("session_id,mark")
          .eq("user_id", userId)
          .in("session_id", ids)
          .order("id")
          .range(offset, offset + 999);
        if (result.error) return rows;
        reviews.push(...(result.data ?? []));
        if (!result.data || result.data.length < 1000) break;
      }
      for (const row of rows) {
        const outcomes = reviews.filter((r) => r.session_id === row.id);
        if (outcomes.length)
          row.recall = {
            knew: outcomes.filter((r) => r.mark === 1).length,
            total: outcomes.length,
          };
      }
    }
    return rows;
  } catch {
    return null;
  }
}
async function readHomeTopics(): Promise<Topic[] | null> {
  try {
    const db = await createClient();
    const result = await db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort");
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

function HomeCard({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full min-w-0 gap-4 p-5">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-1 text-[13px]">
              {description}
            </p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            aria-label={`Open ${title}`}
            className="text-muted-foreground flex shrink-0 items-center gap-1 text-[13px]"
          >
            {href.includes("activity") ? "Activity" : "Progress"}
            <PortalIcon
              size={20}
              strokeWidth={1.5}
              name="arrow-up-right"
              className="size-3.5"
            />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
export async function HomeRecent({
  sessions,
  today,
}: {
  sessions: HomeSessions;
  today?: string;
}) {
  const [rows, topics] = await Promise.all([sessions, readHomeTopics()]);
  return (
    <section className="home-card" aria-labelledby="recent-feedback-title">
      <div className="home-card-head">
        <div>
          <h2 id="recent-feedback-title">Recent feedback</h2>
          <p>Your last 3 sessions</p>
        </div>
        <Link className="home-row-link" href="/student/activity">
          All activity{" "}
          <PortalIcon strokeWidth={1.5} name="arrow-right" size={16} />
        </Link>
      </div>
      {rows === null ? (
        <div className="p-6">
          <TryAgain what="your recent sessions" />
        </div>
      ) : rows.filter(isStudentSession).length ? (
        <ul className="home-marked-list">
          {rows.filter(isStudentSession).map((s) => {
            const href = sessionHref(s)!;
            const recall = s.kind === "flashcards";
            const mark = recall ? s.recall?.knew : s.score;
            const max = recall ? s.recall?.total : s.max_score;
            const hasScore = !!s.finished_at && mark != null && !!max;
            const tone = hasScore ? scoreTone((100 * mark!) / max!) : null;
            const state = !s.finished_at
              ? "Continue"
              : tone === "success"
                ? "Earned"
                : tone === "warning"
                  ? "Partly there"
                  : tone === "destructive"
                    ? "Missed"
                    : recall
                      ? "Reviewed"
                      : "No marks yet";
            const icon = !s.finished_at
              ? "play"
              : tone === "success"
                ? "check"
                : tone === "warning"
                  ? "circle-half"
                  : tone === "destructive"
                    ? "x"
                    : "clock";
            const day = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Australia/Sydney",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(s.started_at));
            const ids = s.config.subtopics?.length
              ? s.config.subtopics
              : s.config.topics;
            return (
              <li key={s.id}>
                <Link href={href} prefetch={false}>
                  <span className="home-session-score">
                    {hasScore ? (
                      <>
                        {mark}
                        <span className="text-muted-foreground text-xs">
                          /{max}
                        </span>
                        {recall && <small>knew</small>}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold">
                      {sessionTitle(
                        {
                          ...s,
                          config: { ...s.config, topics: [], subtopics: [] },
                        },
                        topics ?? [],
                      )}
                    </p>
                    <div className="home-session-meta">
                      <span
                        className={`home-state ${tone ? `home-state-${tone}` : ""}`}
                      >
                        <PortalIcon strokeWidth={1.5} name={icon} size={14} />
                        {state}
                      </span>
                      <span>
                        {topicNames(ids, topics ?? [])} ·{" "}
                        {day === today ? "Today" : dateLabel(s.started_at)}
                      </span>
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
        <p className="text-muted-foreground px-6 pb-6 text-sm">
          No marked sessions yet.{" "}
          <Link className="underline underline-offset-4" href="/student/sprint">
            Start a sprint
          </Link>
          .
        </p>
      )}
    </section>
  );
}

export async function HomeNextStep({ progress }: { progress: HomeProgress }) {
  const topic = nextStepTopic(await progress);
  return (
    <section className="home-next" aria-labelledby="next-step-title">
      <p className="text-ink-2 flex items-center gap-2 text-sm font-semibold">
        <PenCaret />
        Your next step
      </p>
      <h2
        id="next-step-title"
        className="mt-2.5 text-2xl leading-8 font-[650] tracking-[-0.015em]"
      >
        {topic ? (
          <>
            A sprint on{" "}
            <span className="home-topic-mark">
              {topic.name}
              <svg
                className="pen pen-draw"
                viewBox="0 0 240 14"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  pathLength="1"
                  strokeWidth="2.4"
                  d="M3 9.5C42 5.2 90 10.8 138 7.2S212 9.6 237 6"
                />
              </svg>
            </span>{" "}
            <span className="home-hand">start here</span>
          </>
        ) : (
          "Start your first Topic Sprint"
        )}
      </h2>
      <p className="text-ink-2 mt-3 max-w-[62ch]">
        {topic
          ? `It's your lowest topic at ${Math.round((100 * topic.earned) / topic.possible)}%, with ${topic.possible - topic.earned} marks dropped in the last 30 days.`
          : "Pick a topic and Claro marks every answer against the criteria."}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          className={buttonVariants({ size: "lg", className: "home-primary" })}
          href={topic ? practiseHref(topic) : "/student/sprint"}
        >
          Start sprint{" "}
          <PortalIcon size={20} strokeWidth={1.5} name="arrow-right" />
        </Link>
        <Link
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-12 bg-transparent px-5 shadow-none",
          )}
          href="/student/sprint"
        >
          Choose another topic
        </Link>
        <Link className="home-row-link text-ink-2" href="/student/flashcards">
          Flashcards{" "}
          <PortalIcon strokeWidth={1.5} name="arrow-right" size={16} />
        </Link>
      </div>
      <p className="text-ink-2 mt-4 flex items-center gap-1.5 text-[13px] leading-[18px]">
        <PortalIcon strokeWidth={1.5} name="camera" size={16} />
        Type or photograph written answers
      </p>
    </section>
  );
}

export async function HomeWeek({
  today,
  activity,
  progress,
}: {
  today: string;
  activity: Promise<ActivityDay[] | null>;
  progress: HomeProgress;
}) {
  const [days, data] = await Promise.all([activity, progress]);
  const week = practiceWeek(today, days ?? []);
  const average = practiceAverage(data);
  return (
    <section className="home-card p-6" aria-labelledby="this-week-title">
      <h2 id="this-week-title">This week</h2>
      {days === null ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Practice days unavailable
        </p>
      ) : (
        <p className="mt-2 flex items-baseline gap-2">
          <strong className="text-xl leading-6 font-[650] tracking-[-0.01em] tabular-nums">
            {week.filter((d) => d.done).length} of {WEEKLY_PRACTICE_GOAL}
          </strong>
          <span className="text-muted-foreground text-[13px]">
            practice days
          </span>
        </p>
      )}
      <ol className="home-week" aria-label="Practice days this week">
        {week.map((d) => (
          <li
            key={d.day}
            className={`${d.done ? "done" : ""} ${d.today ? "today" : ""}`}
            aria-label={`${d.label}: ${days === null ? "unavailable" : d.done ? "practised" : d.day > today ? "upcoming" : "no practice"}`}
            aria-current={d.today ? "date" : undefined}
          >
            <span aria-hidden>
              {d.done && (
                <PortalIcon strokeWidth={1.5} name="check" size={16} />
              )}
            </span>
            {d.label}
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <div className="text-ink-2 flex flex-wrap justify-between gap-2 text-[13px]">
          <span>
            Practice average{" "}
            <span className="text-muted-foreground">· 30 days</span>
          </span>
          <span className="tabular-nums">
            {average !== null && (
              <strong className="text-foreground">{average}% · </strong>
            )}
            target {PRACTICE_TARGET}%
          </span>
        </div>
        {average === null ? (
          <p className="text-muted-foreground mt-2 text-[13px]">
            No marked answers yet
          </p>
        ) : (
          <div
            className="home-average"
            role="meter"
            aria-label="Practice average"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={average}
          >
            <span
              style={{ width: `${Math.min(100, Math.max(0, average))}%` }}
            />
          </div>
        )}
      </div>
      <Link className="home-row-link mt-5" href="/student/progress">
        See progress{" "}
        <PortalIcon strokeWidth={1.5} name="arrow-right" size={16} />
      </Link>
    </section>
  );
}

export async function HomeLostMarks({
  progress,
  caption = "Marks dropped in the selected range",
}: {
  progress: HomeProgress;
  caption?: string;
}) {
  const d = await progress;
  const rows = d?.topics
    .filter((t) => t.parent_id && t.possible > t.earned)
    .sort((a, b) => b.possible - b.earned - (a.possible - a.earned))
    .slice(0, 5);
  return (
    <HomeCard title="Where your marks go" description={caption}>
      {!d ? (
        <TryAgain what="your dropped marks" />
      ) : rows?.length ? (
        <BarList
          unit="marks"
          rows={rows.map((t) => ({
            label: t.name,
            value: t.possible - t.earned,
            href: practiseHref(t),
          }))}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          No dropped marks in this range.
        </p>
      )}
    </HomeCard>
  );
}
