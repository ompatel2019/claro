import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  loadMarkedComments,
  loadProgress,
  loadSessionScores,
  progressToday,
} from "@/lib/progress-data";
import {
  PRACTICE_TARGET,
  parseRange,
  practiseHref,
  rangeFrom,
} from "@/lib/progress";
import {
  TAG_LABELS,
  coverage,
  markerAsks,
  marksLost,
  practiceTrend,
} from "@/lib/progress-insights";
import { examDaysLeft } from "@/lib/hsc-exam";
import { plural } from "@/lib/practice";
import type { ActivityDay } from "@/lib/activity";
import { createClient } from "@/utils/supabase/server";
import { PortalIcon } from "@/components/icons";
import { ProgressControls } from "@/components/progress-controls";
import { TopicProgressTable } from "@/components/progress-tables";
import { PracticeTrend } from "@/components/student/progress/practice-trend";
import { Meter } from "@/components/claro/data-display";
import { buttonVariants } from "@/components/ui/button";

function Panel({
  id,
  title,
  caption,
  aside,
  className,
  children,
}: {
  id: string;
  title: string;
  caption?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-slot="card"
      aria-labelledby={id}
      className={`progress-card ${className ?? ""}`}
    >
      <div className="progress-card-hd">
        <div className="min-w-0">
          <h2 id={id}>{title}</h2>
          {caption && <p>{caption}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="progress-empty">{children}</p>
);
const PAPER = [
  ["mcq", "Section I · Multiple choice", "question"],
  ["short", "Section II · Short answer", "question"],
  ["extended", "Sections III and IV · Extended response", "response"],
] as const;

export const metadata = pageMetadata("Progress");
export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const p = await searchParams,
    range = parseRange(p.range),
    today = progressToday(),
    from = rangeFrom(range, today);
  const d = await loadProgress(range, today);
  const db = await createClient();
  const [volume, due, marked, scores] = await Promise.all([
    db.rpc("activity_days", { p_from: from, p_to: today }),
    db
      .from("flashcard_progress")
      .select("flashcard_id,flashcards!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("flashcards.status", "live")
      .eq("user_id", profile.id)
      .lte("due_on", today),
    loadMarkedComments(profile.id, from),
    loadSessionScores(profile.id, from),
  ]);
  // Every marked answer in range, including ones not tied to a topic.
  const answered =
    d.stats?.answered ??
    d.topics.filter((t) => !t.parent_id).reduce((n, t) => n + t.answered, 0);
  const average =
    typeof d.stats?.pct === "number" && Number.isFinite(d.stats.pct)
      ? Math.round(d.stats.pct)
      : null;
  const days = volume.error ? null : ((volume.data ?? []) as ActivityDay[]);
  const activeDays = days?.filter(
    (day) => day.questions + day.cards > 0,
  ).length;
  const trend = scores ? practiceTrend(scores, from, today) : null;
  const lost = marksLost(d.topics);
  const focus = lost.find((l) => l.weak)?.topic.id;
  const maxLost = lost[0]?.lost ?? 0;
  const asks = marked ? markerAsks(marked) : null;
  const cover = coverage(d.topics);
  const examDays = examDaysLeft(today);
  const dueCount = due.error ? null : (due.count ?? 0);
  const scope =
    range === "all"
      ? "across all time"
      : range === "year"
        ? "this year"
        : `in the last ${range} days`;
  return (
    <div
      className="progress-page min-w-0"
      data-testid="progress-page"
      data-range={range}
    >
      <div className="progress-hd">
        <div className="min-w-0">
          <h1>Progress</h1>
          <p data-testid="progress-meta">
            From your marked answers: {plural(answered, "question")}
            {activeDays == null
              ? ""
              : ` over ${plural(activeDays, "active day")}`}
            {dueCount == null ? "." : ". "}
            {dueCount != null && (
              <Link href="/student/flashcards">
                {plural(dueCount, "flashcard")} due today
              </Link>
            )}
          </p>
        </div>
        <ProgressControls range={range} />
      </div>

      <div className="progress-grid progress-grid--a">
        <Panel
          id="progress-trend-h"
          title="Practice average"
          caption={
            trend
              ? `Marks earned out of marks available. Chart: finished sessions, ${trend.size === 1 ? "day by day" : trend.size === 7 ? "week by week" : "in 30-day blocks"}.`
              : "Marks earned out of marks available"
          }
          className="progress-trend-card"
        >
          <div className="progress-trend-figs">
            <p className="progress-trend-avg">
              {average == null ? "No marks yet" : `${average}%`}
            </p>
            <p className="progress-trend-note">
              {plural(answered, "marked answer")} {scope}
            </p>
            <p className="progress-trend-target">
              <span aria-hidden="true" />
              Target <b>{PRACTICE_TARGET}%</b>
            </p>
          </div>
          {trend == null ? (
            <Empty>Your session history is unavailable right now.</Empty>
          ) : trend.sessions ? (
            <PracticeTrend points={trend.points} size={trend.size} />
          ) : (
            <Empty>
              No finished practice sessions {scope}.{" "}
              <Link href="/student/sprint">Start a Topic Sprint</Link>
            </Empty>
          )}
        </Panel>

        <Panel
          id="progress-loss-h"
          title="Where you’re losing marks"
          caption="Dot points ranked by marks lost. Start at the top."
        >
          {lost.length ? (
            <ol className="progress-loss">
              {lost.map((l, i) => (
                <li key={l.topic.id}>
                  <div className="min-w-0">
                    <b>
                      {l.topic.name}
                      {l.topic.id === focus && (
                        <span className="progress-focus">Focus</span>
                      )}
                    </b>
                    <small>
                      {l.whole ? "Whole-topic questions" : (l.parent ?? "")}
                      {" · "}lost {l.lost} of {l.possible} marks
                    </small>
                  </div>
                  <Link
                    href={practiseHref(l.topic)}
                    aria-label={`Practise ${l.topic.name}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "progress-act",
                    })}
                  >
                    Practise
                  </Link>
                  <i
                    aria-hidden="true"
                    className={i === 0 ? "is-top" : undefined}
                    style={{ width: `${(100 * l.lost) / maxLost}%` }}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No marks lost {scope}.</Empty>
          )}
        </Panel>
      </div>

      <div className="progress-grid progress-grid--b">
        <Panel
          id="progress-asks-h"
          title="What the marker keeps asking for"
          caption={
            asks?.answers
              ? `From the marker’s fixes on your ${plural(asks.answers, "marked written answer")} ${scope}`
              : "From the marker’s fixes on your written answers"
          }
        >
          {asks == null ? (
            <Empty>Marker comments are unavailable right now.</Empty>
          ) : asks.asks.length ? (
            <ol className="progress-asks">
              {asks.asks.map((a) => (
                <li key={a.tag}>
                  <div className="min-w-0">
                    <b>{TAG_LABELS[a.tag]}</b>
                    <small>
                      <span className="sr-only">Latest comment: </span>
                      {a.latest}
                    </small>
                  </div>
                  <span className="progress-asks-n">
                    {plural(a.answers, "answer")}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>
              {asks.answers
                ? `No tagged fixes on your written answers ${scope}.`
                : `No marked written answers ${scope}.`}
            </Empty>
          )}
        </Panel>

        <Panel
          id="progress-ready-h"
          title="Exam readiness"
          caption="Your marks in each part of the paper"
          aside={
            examDays != null && (
              <span className="progress-tag">
                <PortalIcon name="clock" size={14} strokeWidth={1.5} />
                {examDays === 0
                  ? "Exam today"
                  : `${plural(examDays, "day")} to go`}
              </span>
            )
          }
        >
          <ul className="progress-ready">
            {PAPER.map(([id, label, unit]) => {
              const row = d.types.find((r) => r.id === id);
              return (
                <li key={id}>
                  <div className="progress-ready-hd">
                    <b>{label}</b>
                    <span>
                      {row?.pct == null
                        ? "Not started"
                        : `${Math.round(row.pct)}%`}
                    </span>
                  </div>
                  <small>
                    {plural(row?.answered ?? 0, unit)}{" "}
                    {unit === "response" ? "marked" : "answered"}
                  </small>
                  <div
                    className="progress-ready-meter"
                    style={
                      {
                        "--target": `${PRACTICE_TARGET}%`,
                      } as React.CSSProperties
                    }
                  >
                    <Meter value={row?.pct ?? 0} label={`${label} average`} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="progress-cover">
            <b>
              {cover.practised} of {cover.total}
            </b>{" "}
            dot points practised {scope}. The line on each bar is your{" "}
            {PRACTICE_TARGET}% practice target.
          </p>
        </Panel>
      </div>

      <Panel
        id="progress-topics-h"
        title="Marks by topic"
        caption="Weakest first. Open a topic for its dot points."
        className="progress-topics-card"
      >
        <TopicProgressTable rows={d.topics} />
      </Panel>
    </div>
  );
}
