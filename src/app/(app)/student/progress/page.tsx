import { pageMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { loadProgress, progressToday } from "@/lib/progress-data";
import {
  parseRange,
  rangeFrom,
  weakSpots,
  masterySegments,
  reportHref,
  verbRows,
  type ProgressRange,
} from "@/lib/progress";
import { weakTopicUnlock } from "@/lib/weak-topics";
import { sessionTitle } from "@/lib/home";
import { sydneyToday } from "@/lib/flashcards";
import { dateLabel, timer, plural } from "@/lib/practice";
import { PageHeader } from "@/components/claro/layout";
import { SessionScoreTrend } from "@/components/score-trend";
import { ProgressControls } from "@/components/progress-controls";
import {
  TopicProgressTable,
  VerbProgressTable,
} from "@/components/progress-tables";
import { EmptyState as Empty } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { TryAgain } from "@/components/try-again";
import {
  Cards,
  Target,
  History,
  CheckCircle,
  Clock,
  Alert,
  Dot,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Meter, ScoreRing } from "@/components/claro/data-display";
import { Skeleton } from "@/components/ui/skeleton";

function Section({
  title,
  children,
  caption,
}: {
  title: string;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <Card className="min-w-0 gap-4">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {caption && (
          <p className="text-muted-foreground text-[13px]">{caption}</p>
        )}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
function CardSkeleton() {
  return (
    <Card className="min-w-0 p-5">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-44 w-full" />
    </Card>
  );
}

type Scope = { range: ProgressRange; today: string };
async function MarkSummary({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d) return null;
  const parents = d.topics.filter((t) => !t.parent_id);
  const earned = parents.reduce((sum, t) => sum + t.earned, 0);
  const possible = parents.reduce((sum, t) => sum + t.possible, 0);
  const answered = parents.reduce((sum, t) => sum + t.answered, 0);
  if (!possible) return null;
  return (
    <Section
      title="Practice average"
      caption={`${plural(answered, "marked answer")} in this range`}
    >
      <div className="flex justify-center py-4">
        <ScoreRing score={earned} of={possible} size={160} />
      </div>
      <p className="text-muted-foreground border-t pt-4 text-[13px]">
        Your marks across topics in the selected range.
      </p>
    </Section>
  );
}
async function HistoryCard({
  range,
  today,
  kind,
  type,
}: Scope & { kind?: string; type?: string }) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Score history">
        <TryAgain what="your score history" />
      </Section>
    );
  const sessions = d.history.filter(
    (s) =>
      ["sprint", "flashcards", "single"].includes(s.kind) &&
      (!kind || s.kind === kind) &&
      (!type || s.by_type[type] != null),
  );
  const points = sessions.flatMap((s) => {
    const pct = type ? s.by_type[type] : s.pct;
    return pct === null
      ? []
      : [
          {
            id: s.id,
            day: sydneyToday(new Date(s.finished_at)),
            at: s.finished_at,
            pct,
            href: reportHref(s),
            label: `${sessionTitle(s, d.topics)} · ${dateLabel(s.finished_at, true)} · ${Math.round(pct)}% · ${timer(s.elapsed_s)}`,
          },
        ];
  });
  return (
    <Section
      title="Score history"
      caption="Each finished session, in the order you completed it."
    >
      <ProgressControls range={range} filters />
      {points.length ? (
        <div className="mt-4">
          <SessionScoreTrend
            points={points}
            from={rangeFrom(range, today) ?? points[0].day}
            today={today}
            range={range}
          />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">
              View {plural(points.length, "session")}
            </summary>
            <ul className="mt-3 divide-y divide-dashed">
              {points.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {p.href ? (
                      <Link
                        href={p.href}
                        className="text-sm underline underline-offset-4"
                      >
                        {p.label}
                      </Link>
                    ) : (
                      <span>{p.label}</span>
                    )}
                  </div>
                  <StatusPill pill="Finished" />
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <div className="mt-4">
          <Empty
            title="No scores in this range"
            description="Finish a sprint to see your score history, or choose another range or filter."
            icon={History}
          />
        </div>
      )}
    </Section>
  );
}
async function Topics({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Marks by topic">
        <TryAgain what="marks by topic" />
      </Section>
    );
  return (
    <Section
      title="Marks by topic"
      caption="Open a section to explore its subtopics."
    >
      {!d.topics.some((t) => t.possible > 0) && (
        <div className="mb-4">
          <Empty
            icon={Target}
            title="No topic marks yet"
            description="Finish a sprint to see marks by topic."
          />
        </div>
      )}
      <TopicProgressTable rows={d.topics} />
    </Section>
  );
}
async function Types({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section
        title="By question type"
        caption="Average mark for each kind of question"
      >
        <TryAgain what="marks by question type" />
      </Section>
    );
  if (!d.types.length)
    return (
      <Empty
        icon={Target}
        title="By question type"
        description="Finish a sprint to see where each question type earns marks."
      />
    );
  return (
    <Section
      title="By question type"
      caption="Average mark for each kind of question"
    >
      <dl className="grid gap-4">
        {[
          ["mcq", "Multiple choice"],
          ["short", "Short answer"],
          ["extended", "Extended response"],
        ].map(([id, label]) => {
          const t = d.types.find((t) => t.id === id);
          return (
            <div key={id} className="grid min-w-0 gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm font-medium">{label}</dt>
                <dd className="text-muted-foreground text-[13px]">
                  {t?.pct != null ? (
                    <>
                      <span className="text-foreground font-semibold">
                        {Math.round(t.pct)}%
                      </span>{" "}
                      · {plural(t.answered, "answer")}
                    </>
                  ) : (
                    "Not started"
                  )}
                </dd>
              </div>
              {t?.pct != null && (
                <dd>
                  <Meter
                    value={t.pct}
                    label={`${label} average`}
                    className="h-2"
                  />
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </Section>
  );
}
async function Verbs({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="By directive verb">
        <TryAgain what="marks by verb" />
      </Section>
    );
  if (!verbRows(d.verbs).length)
    return (
      <Empty
        icon={Target}
        title="By directive verb"
        description="Answer at least 3 questions with the same directive verb to see a comparison."
      />
    );
  return (
    <Section
      title="By directive verb"
      caption="Verbs with at least 3 answers. Start with your lowest average."
    >
      <VerbProgressTable rows={d.verbs} />
    </Section>
  );
}
async function Weak({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Weak spots">
        <TryAgain what="your weak spots" />
      </Section>
    );
  const rows = weakSpots(d.topics, d.missed);
  const locked = d.topics.filter(
    (t) => t.parent_id && t.answered > 0 && weakTopicUnlock(t),
  );
  return (
    <Section
      title="Weak spots"
      caption="Question weak spots unlock after 3 marked answers across 2 sessions in a topic. Cards rated Missed or Mostly appear alongside them."
    >
      {!rows.length && !locked.length && (
        <Empty
          icon={Target}
          title={
            d.topics.some((t) => t.answered > 0)
              ? "No weak spots in this range"
              : "Build your topic history"
          }
          description="Practise questions or review flashcards to find where to focus next."
        />
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {locked.map((t) => (
          <li
            key={`locked-${t.id}`}
            className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm"
          >
            <p className="text-foreground mb-2 font-semibold">{t.name}</p>
            {weakTopicUnlock(t)}
            {t.sessions != null && (
              <div className="mt-4 grid gap-1.5">
                <p className="flex justify-between text-xs">
                  <span>Sessions</span>
                  <span>{t.sessions} of 2</span>
                </p>
                <Meter
                  value={(t.sessions / 2) * 100}
                  label={`${t.name} sessions toward unlocking`}
                />
              </div>
            )}
          </li>
        ))}
        {rows.map((r) => {
          const topic = r.id.startsWith("q-")
            ? d.topics.find((t) => t.id === r.id.slice(2))
            : undefined;
          return (
            <li
              key={r.id}
              className="flex flex-col items-start gap-3 rounded-xl border p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {r.caption}
                </p>
                {topic?.pct != null && (
                  <Meter
                    value={topic.pct}
                    tone="brand"
                    label={`${r.name} average`}
                    className="mt-3"
                  />
                )}
              </div>
              <Link
                href={r.href}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "mt-auto shrink-0",
                })}
              >
                {r.action}
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
const CATEGORY_STYLE = {
  Known: ["bg-success", CheckCircle],
  Learning: ["bg-warning", Clock],
  Missed: ["bg-destructive", Alert],
  New: ["bg-muted-foreground/30", Dot],
} as const;
async function Mastery({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Flashcard mastery">
        <TryAgain what="flashcard mastery" />
      </Section>
    );
  if (!d.mastery.length)
    return (
      <Empty
        title="Flashcard mastery"
        description="Review cards to see your mastery. New cards appear in the range they were added."
        icon={Cards}
      />
    );
  const max = Math.max(1, ...d.due.map((d) => d.count));
  return (
    <Section
      title="Flashcard mastery"
      caption="Latest ratings recorded in this range, plus new cards added in it."
    >
      <div className="space-y-6">
        {d.mastery.map((m) => (
          <div key={m.id}>
            <h3 className="text-sm font-semibold">
              {m.id === "term" ? "Terms" : "Key stats"}
            </h3>
            <div
              role="img"
              aria-label={masterySegments(m)
                .map((s) => `${s.label}: ${s.count}`)
                .join(", ")}
              className="bg-muted mt-3 flex h-3 overflow-hidden rounded-full"
            >
              {masterySegments(m).map((s) => (
                <span
                  key={s.label}
                  className={CATEGORY_STYLE[s.label][0]}
                  style={{ width: `${s.width}%` }}
                />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {masterySegments(m).map((s) => {
                const Icon = CATEGORY_STYLE[s.label][1];
                return (
                  <li key={s.label} className="flex items-center gap-1.5">
                    <Icon className="size-3" aria-hidden />
                    {s.label}{" "}
                    <span className="ml-auto font-semibold tabular-nums">
                      {s.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-sm font-semibold">Due in the next 7 days</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Today includes overdue cards rated in this range.
          </p>
          <div className="mt-4 grid grid-cols-7 gap-2">
            {d.due.map((day, i) => (
              <div key={day.day} className="min-w-0 text-center">
                <p className="text-xs tabular-nums">{day.count}</p>
                <div className="mt-2 flex h-16 items-end justify-center">
                  <div
                    className="bg-primary w-full max-w-8 rounded-t-sm"
                    style={{ height: `${(day.count / max) * 100}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-[10px]">
                  {i === 0 ? "Today" : dateLabel(day.day, true).split(" ")[0]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

export const metadata = pageMetadata("Progress");

export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireProfile();
  const p = await searchParams;
  const range = parseRange(p.range),
    today = progressToday(),
    scope = { range, today };
  const kind =
    typeof p.kind === "string" && ["sprint", "single"].includes(p.kind)
      ? p.kind
      : undefined;
  const type =
    typeof p.type === "string" && ["mcq", "short", "extended"].includes(p.type)
      ? p.type
      : undefined;
  return (
    <div
      className="min-w-0 space-y-4"
      data-testid="progress-page"
      data-range={range}
    >
      <PageHeader
        title="Progress"
        description="See where your marks come from and make your next session count."
        actions={<ProgressControls range={range} />}
      />
      <div className="grid min-w-0 gap-5 xl:grid-cols-3">
        <Suspense key={`summary-${range}`} fallback={<CardSkeleton />}>
          <MarkSummary {...scope} />
        </Suspense>
        <div className="min-w-0 xl:col-span-2">
          <Suspense
            key={`history-${range}-${kind}-${type}`}
            fallback={<CardSkeleton />}
          >
            <HistoryCard {...scope} kind={kind} type={type} />
          </Suspense>
        </div>
      </div>
      <Suspense key={`topics-${range}`} fallback={<CardSkeleton />}>
        <Topics {...scope} />
      </Suspense>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <Suspense key={`types-${range}`} fallback={<CardSkeleton />}>
          <Types {...scope} />
        </Suspense>
        <Suspense key={`verbs-${range}`} fallback={<CardSkeleton />}>
          <Verbs {...scope} />
        </Suspense>
      </div>
      <Suspense key={`weak-${range}`} fallback={<CardSkeleton />}>
        <Weak {...scope} />
      </Suspense>
      <Suspense key={`mastery-${range}`} fallback={<CardSkeleton />}>
        <Mastery {...scope} />
      </Suspense>
    </div>
  );
}
