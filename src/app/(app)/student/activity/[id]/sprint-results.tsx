import Link from "next/link";
import { PortalIcon } from "@/components/icons";
import { after } from "next/server";
import { loadSprint } from "@/lib/practice-data";
import { finishOpenSessions } from "@/lib/session-finish";
import { createClient } from "@/utils/supabase/server";
import { modeLabel, timeLimit, type Topic } from "@/lib/practice";
import { markingState, type ReviewRow } from "@/lib/feedback";
import {
  below,
  resultsState,
  kpis,
  markingInFlight,
  mcGridRows,
  sprintHref,
  timeMeta,
  visibleResults,
} from "@/lib/results";
import {
  fullMarks,
  lostMarks,
  questionList,
  scoreVsAverage,
  timeVsAverage,
} from "@/lib/results-stats";
import { PageHeader } from "@/components/claro/layout";
import { MarkingProgress } from "@/components/marking-progress";
import { RetryAnswer } from "@/components/retry-answer";
import { ResultsAnswers, OverallFeedback } from "@/components/results-report";
import { SameSetup } from "@/components/sprint-setup";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const when = (d: string) =>
  new Date(d)
    .toLocaleDateString("en-AU", {
      timeZone: "Australia/Sydney",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(/^(\w{3}),/, "$1");
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Sprint results, rendered by /student/activity/[id]. loadSprint re-checks the owner and kind. */
export async function SprintResults({ id }: { id: string }) {
  const { session: s, profile, attempts } = await loadSprint(id);
  if (!s.finished_at) {
    // No resume: an open sprint opened here is finished (answered questions marked), and a
    // Finish run that died (tab closed before it was sent, or a timed-out run) is resumed.
    if (!markingInFlight(s, attempts))
      after(() => finishOpenSessions(profile.id, { only: id }));
    const counted = attempts.filter((a) => a.status !== "skipped");
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Marking in progress"
          title={`${modeLabel(s.config.mode)} sprint`}
          description="We’re marking your answers. This page fills in when marking is done."
        />
        <MarkingProgress
          done={counted.filter((a) => a.status === "marked").length}
          total={counted.length}
          marking={counted.filter((a) => a.status === "marking").length}
          attention={0}
          inProgress
          sessionId={id}
        />
      </div>
    );
  }
  const db = await createClient();
  const [topicRes, review, past] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort"),
    db.rpc("session_review", { p_session: id }),
    db
      .from("sessions")
      .select("id,score,max_score,elapsed_s")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .eq("config->>mode", s.config.mode)
      .not("finished_at", "is", null)
      .neq("id", id)
      .order("finished_at", { ascending: false })
      .limit(20),
  ]);
  if (topicRes.error || review.error || past.error)
    throw new Error("Could not load your results.");
  const topics = (topicRes.data ?? []) as Topic[];
  const rows = visibleResults(review.data as ReviewRow[]);
  const topicIds = [...new Set(rows.flatMap((r) => r.topic_id ?? []))];
  const cardRes = await db
    .from("flashcards")
    .select("topic_id")
    .in("topic_id", topicIds);
  const cards: Record<string, number> = {};
  for (const c of cardRes.data ?? [])
    cards[c.topic_id] = (cards[c.topic_id] ?? 0) + 1;
  const paths = rows.flatMap((r) => r.image_paths ?? []);
  const signed = paths.length
    ? (await db.storage.from("answers").createSignedUrls(paths, 3600)).data
    : null;
  const url = new Map(signed?.map((x) => [x.path, x.signedUrl]));

  const name = (tid: string | null) =>
    topics.find((t) => t.id === tid)?.name ?? "";
  const k = kpis(rows);
  const total = rows.reduce((n, r) => n + Number(r.max_marks ?? r.marks), 0);
  const progress = resultsState(rows, s.summary);
  const provisional = rows.some((r) => markingState(r) === "in_review");
  const failed = rows.filter((r) => markingState(r) === "failed");
  const mistakes = rows.filter(below).length;
  const limit = timeLimit(s.config);
  const scorePct = total ? (k.score.mark / total) * 100 : null;
  const scoreAvg = avg(
    past.data.map((p) => (p.max_score ? (p.score / p.max_score) * 100 : null)),
  );
  const timeAvg = avg(past.data.map((p) => p.elapsed_s));
  const elapsed = s.elapsed_s ?? 0;
  const places = s.config.subtopics?.length
    ? s.config.subtopics
    : s.config.topics;
  const vsScore = scoreVsAverage(scorePct, scoreAvg);
  const vsTime = timeVsAverage(elapsed, timeAvg);
  const lost = rows.filter(lostMarks).map((r) => r.position);
  const full = rows.filter(fullMarks).length;
  return (
    <div className="space-y-5">
      <Link
        href="/student/activity"
        aria-label="Back to activity"
        className="text-muted-foreground flex w-fit items-center gap-1.5 text-[13px]"
      >
        <PortalIcon name="arrow-left" className="size-3.5" />
        Activity
      </Link>
      <PageHeader
        eyebrow={`${when(s.started_at)} · ${rows.length} ${rows.length === 1 ? "question" : "questions"}`}
        title={`${modeLabel(s.config.mode)} sprint · ${places?.length ? places.map(name).join(", ") : "All topics"}`}
        actions={
          <>
            {mistakes > 0 && (
              <Link
                href={sprintHref(s.config, { history: "mistakes" })}
                className={buttonVariants()}
              >
                <PortalIcon name="target" className="size-4" />
                Retry mistakes ({mistakes})
              </Link>
            )}
            <SameSetup config={s.config} />
            {failed.length > 0 && (
              <RetryAnswer
                ids={failed.map((r) => r.attempt_id)}
                label={`Retry all failed (${failed.length})`}
              />
            )}
          </>
        }
      />
      <MarkingProgress {...progress} />
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2">
        {/* Score is the hero: a full row above Time and Full marks. */}
        <Stat
          hero
          label="Score"
          pill={provisional && <StatusPill pill="Provisional" />}
        >
          <StatValue
            hero
            value={`${provisional ? "≈ " : ""}${k.score.mark}`}
            unit={`/${total}`}
            extra={scorePct == null ? null : `${Math.round(scorePct)}%`}
          />
          {vsScore && <StatNote up={vsScore.up}>{vsScore.text}</StatNote>}
        </Stat>
        <Stat label="Time">
          <StatValue
            value={timeMeta(elapsed, null)}
            unit={limit ? `of ${timeMeta(limit, null)}` : null}
          />
          {vsTime && <StatNote>{vsTime}</StatNote>}
        </Stat>
        <Stat label="Full marks">
          <StatValue
            value={String(full)}
            unit={`of ${rows.length} ${rows.length === 1 ? "question" : "questions"}`}
          />
          {lost.length > 0 && (
            <StatNote>
              Review{" "}
              {questionList(lost)
                .split(/(Q\d+)/)
                .map((part, i) =>
                  /^Q\d+$/.test(part) ? (
                    <a
                      key={i}
                      href={`#q-${part.slice(1)}`}
                      className="text-brand-text font-semibold underline underline-offset-4"
                    >
                      {part}
                    </a>
                  ) : (
                    part
                  ),
                )}
            </StatNote>
          )}
        </Stat>
      </section>
      {/* Strengths and fixes sum up the whole sprint, so they lead. */}
      <OverallFeedback
        summary={s.summary}
        pending={progress.summaryPending}
        hideNextStep
      />
      <ResultsAnswers
        sprintLayout
        mcGrid={mcGridRows(rows)}
        rows={rows}
        id={id}
        name={name}
        photos={url}
        cards={cards}
      />
    </div>
  );
}

function Stat({
  label,
  pill,
  hero = false,
  children,
}: {
  label: string;
  pill?: React.ReactNode;
  hero?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      size="sm"
      data-hero={hero || undefined}
      className={cn(
        "min-w-0 gap-1.5 px-(--card-spacing)",
        hero && "gap-2 py-6 sm:col-span-2",
      )}
    >
      <p
        className={cn(
          "text-ink-2 flex items-center gap-2 font-semibold",
          hero ? "text-sm" : "text-[13px]",
        )}
      >
        {label} {pill}
      </p>
      {children}
    </Card>
  );
}

function StatValue({
  value,
  unit,
  extra,
  hero = false,
}: {
  hero?: boolean;
  value: string;
  /** "/15" sits flush against the value; "of 22:30" is spaced. */
  unit?: string | null;
  extra?: string | null;
}) {
  const flush = unit?.startsWith("/");
  return (
    <p className="text-ink flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
      <span>
        <span
          className={cn(
            "num-display leading-none font-bold",
            hero ? "text-[56px] sm:text-[72px]" : "text-[28px]",
          )}
        >
          {value}
        </span>
        {flush && (
          <span
            className={cn(
              "text-muted-foreground font-medium",
              hero ? "text-2xl" : "text-sm",
            )}
          >
            {unit}
          </span>
        )}
      </span>
      {unit && !flush && (
        <span className="text-muted-foreground text-sm font-medium">
          {unit}
        </span>
      )}
      {extra && (
        <span
          className={cn(
            "text-ink ml-1 font-semibold",
            hero ? "text-2xl" : "text-base",
          )}
        >
          {extra}
        </span>
      )}
    </p>
  );
}

function StatNote({
  up = false,
  children,
}: {
  /** Better than average: success text with an up arrow. */
  up?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-[13px]",
        up ? "text-success-text" : "text-muted-foreground",
      )}
    >
      {up && (
        <PortalIcon name="arrow-up-right" aria-hidden className="size-3.5" />
      )}
      <span>{children}</span>
    </p>
  );
}
