import Link from "next/link";
import { PortalIcon } from "@/components/icons";
import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { createClient } from "@/utils/supabase/server";
import { modeLabel, timeLimit, type Topic } from "@/lib/practice";
import { markingState, type ReviewRow } from "@/lib/feedback";
import {
  below,
  resultsState,
  delta,
  kpis,
  markingInFlight,
  mcGridRows,
  pct,
  sprintHref,
  timeMeta,
  visibleResults,
} from "@/lib/results";
import { summaryView } from "@/lib/results-summary";
import { PageHeader } from "@/components/claro/layout";
import { MarkingProgress } from "@/components/marking-progress";
import { RetryAnswer } from "@/components/retry-answer";
import { ResultsAnswers, OverallFeedback } from "@/components/results-report";
import { SameSetup } from "@/components/sprint-setup";
import { ResultStat } from "@/components/student/sprint/result-stat";
import { ResultsNextStep } from "@/components/student/sprint/results-next-step";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";

const when = (d: string) =>
  new Date(d)
    .toLocaleDateString("en-AU", {
      timeZone: "Australia/Sydney",
      weekday: "short",
      day: "numeric",
      month: "short",
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
    if (!markingInFlight(attempts, s.config.feedback))
      redirect(`/student/sprint/${id}`);
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
  const pastIds = past.data.map((p) => p.id);
  const [cardRes, pastAttempts] = await Promise.all([
    db.from("flashcards").select("topic_id").in("topic_id", topicIds),
    pastIds.length
      ? db
          .from("attempts")
          .select("session_id,mark,max_marks,question:questions(type)")
          .in("session_id", pastIds)
          .eq("status", "marked")
      : { data: [] },
  ]);
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
  // Averages over past sprints of this type (per-type tallies from their marked attempts).
  const pastRows = (pastAttempts.data ?? []) as unknown as {
    mark: number;
    max_marks: number;
    question: { type: string } | null;
  }[];
  const typeAvg = (mc: boolean) => {
    const xs = pastRows.filter((r) => (r.question?.type === "mcq") === mc);
    const max = xs.reduce((n, r) => n + Number(r.max_marks), 0);
    return max
      ? (xs.reduce((n, r) => n + Number(r.mark), 0) / max) * 100
      : null;
  };
  const scorePct = total ? (k.score.mark / total) * 100 : null;
  const scoreAvg = avg(
    past.data.map((p) => (p.max_score ? (p.score / p.max_score) * 100 : null)),
  );
  const timeAvg = avg(past.data.map((p) => p.elapsed_s));
  const elapsed = s.elapsed_s ?? 0;
  const minutes = (n: number | null) => (n == null ? null : n / 60);
  const places = s.config.subtopics?.length
    ? s.config.subtopics
    : s.config.topics;

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
        eyebrow={`${when(s.started_at)} · ${timeMeta(elapsed, limit)}`}
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
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-[minmax(0,5fr)_repeat(3,minmax(0,2fr))] xl:gap-4">
        <ResultStat
          label={
            <span className="flex items-center gap-2">
              Score {provisional && <StatusPill pill="Provisional" />}
            </span>
          }
          value={`${provisional ? "≈ " : ""}${scorePct == null ? "–" : `${Math.round(scorePct)}%`}`}
          score={{ mark: k.score.mark, max: total }}
          comparison={delta(scorePct, scoreAvg, " pts")}
        />
        <ResultStat
          neutral
          label="Time"
          value={timeMeta(elapsed, null)}
          comparison={delta(minutes(elapsed), minutes(timeAvg), " min")}
        />
        {k.mcCount > 0 && (
          <ResultStat
            label="Multiple choice"
            value={
              <>
                {k.mc.mark}
                <span className="text-muted-foreground text-base font-medium">
                  /{k.mc.max}
                </span>
              </>
            }
            comparison={delta(pct(k.mc), typeAvg(true), " pts")}
          />
        )}
        {k.writtenCount > 0 && (
          <ResultStat
            label="Written"
            value={
              <>
                {k.written.mark}
                <span className="text-muted-foreground text-base font-medium">
                  /{k.written.max}
                </span>
              </>
            }
            comparison={delta(pct(k.written), typeAvg(false), " pts")}
          />
        )}
      </div>
      <ResultsNextStep
        rows={rows}
        topics={topics}
        config={s.config}
        cards={cards}
        note={summaryView(s.summary).nextStep}
      />
      <ResultsAnswers
        sprintLayout
        mcGrid={mcGridRows(rows)}
        rows={rows}
        id={id}
        name={name}
        photos={url}
      />
      <OverallFeedback
        summary={s.summary}
        pending={progress.summaryPending}
        hideNextStep
      />
    </div>
  );
}
