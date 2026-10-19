import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import type { ProgressData } from "@/lib/progress";
import { rangeFrom, reportHref } from "@/lib/progress";
import { sydneyToday } from "@/lib/flashcards";
import { dateLabel, type Session, type Topic } from "@/lib/practice";
import { sessionHref } from "@/lib/session-summary";
import { Card } from "@/components/ui/card";
import { TryAgain } from "@/components/try-again";
import { SessionList } from "@/components/session-list";
import { SessionScoreTrend } from "@/components/score-trend";
import { Meter } from "@/components/claro/data-display";
import {
  ArrowUpRight,
  Cards,
  History,
  Sprint,
  Target,
} from "@/components/icons";

export type HomeProgress = Promise<ProgressData | null>;
export type HomeSessions = Promise<Session[] | null>;
export async function readHomeSessions(userId: string): HomeSessions {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .in("kind", ["sprint", "flashcards", "single"])
      .order("started_at", { ascending: false })
      .limit(5);
    return error ? null : (data as Session[]);
  } catch {
    return null;
  }
}
export function HomeCard({
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
      <div className="flex items-start justify-between gap-3">
        <div>
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
            className="text-muted-foreground shrink-0 text-xs"
          >
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
export async function HomeStats({
  progress,
  due,
}: {
  progress: HomeProgress;
  due: Promise<number | null>;
}) {
  const [d, count] = await Promise.all([progress, due]);
  const parents = d?.topics.filter((t) => !t.parent_id);
  const earned = parents?.reduce((n, t) => n + t.earned, 0);
  const answered = parents?.reduce((n, t) => n + t.answered, 0);
  const seconds = d?.history
    .filter((s) => s.finished_at && Number.isFinite(Date.parse(s.finished_at)))
    .reduce((n, s) => n + (Number.isFinite(s.elapsed_s) ? s.elapsed_s : 0), 0);
  return (
    <section
      aria-label="Quick start"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5"
    >
      {[
        {
          title: "Marks earned",
          value: earned,
          caption: "Last 90 days",
          href: "/student/progress",
          icon: Target,
          label: "View marks earned",
        },
        {
          title: "Questions answered",
          value: answered,
          caption: "Last 90 days",
          href: "/student/sprint",
          icon: Sprint,
          label: "Topic Sprint",
        },
        {
          title: "Study time",
          value:
            seconds == null
              ? undefined
              : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`,
          caption: "Finished sessions · last 90 days",
          href: "/student/activity",
          icon: History,
          label: "Activity",
        },
        {
          title: "Cards due",
          value: count,
          caption: "Review now",
          href: "/student/flashcards",
          icon: Cards,
          label: `Flashcards ${count ?? "Choose a deck"}${count == null ? "" : " due"}`,
        },
      ].map(({ title, value, caption, href, icon: Icon, label }) => (
        <Link
          key={title}
          href={href}
          aria-label={`${label} · ${title}`}
          className="bg-card shadow-card hover:border-foreground/20 flex min-h-[152px] flex-col justify-between rounded-xl border p-5 focus-visible:outline-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-[13px]">{title}</h2>
            <span className="bg-muted text-muted-foreground grid size-8 place-items-center rounded-lg">
              <Icon aria-hidden className="size-4" />
            </span>
          </div>
          <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">
            {value ?? "Unavailable"}
          </p>
          <p className="text-muted-foreground text-xs">{caption}</p>
        </Link>
      ))}
    </section>
  );
}
export async function HomeAverage({
  progress,
  today,
}: {
  progress: HomeProgress;
  today: string;
}) {
  const d = await progress;
  const parents = d?.topics.filter((t) => !t.parent_id) ?? [];
  const earned = parents.reduce((n, t) => n + t.earned, 0),
    possible = parents.reduce((n, t) => n + t.possible, 0);
  const points = (d?.history ?? []).flatMap((s) =>
    !s.finished_at ||
    !Number.isFinite(Date.parse(s.finished_at)) ||
    s.pct == null
      ? []
      : [
          {
            id: s.id,
            day: sydneyToday(new Date(s.finished_at)),
            at: s.finished_at,
            pct: s.pct,
            label: `${dateLabel(s.finished_at)} · ${Math.round(s.pct)}%`,
            href: reportHref(s),
          },
        ],
  );
  return (
    <HomeCard
      title="Practice average"
      description="Your marked answers in the last 90 days"
      href="/student/progress"
    >
      {!d ? (
        <TryAgain what="your practice average" />
      ) : (
        <>
          <p className="text-[44px] leading-tight font-bold tracking-tight">
            {possible
              ? `${Math.round((100 * earned) / possible)}%`
              : "No marks yet"}
          </p>
          {points.length > 0 && (
            <>
              <p className="text-muted-foreground text-xs">
                Finished-session score history
              </p>
              <SessionScoreTrend
                compact
                points={points}
                from={rangeFrom("90", today)!}
                today={today}
                range="90"
              />
            </>
          )}
          <dl className="grid grid-cols-3 gap-4 border-t pt-4">
            {[
              ["mcq", "Multiple choice"],
              ["short", "Short answer"],
              ["extended", "Extended response"],
            ].map(([id, label]) => {
              const t = d.types.find((t) => t.id === id);
              return (
                <div key={id} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="my-2 text-sm">
                    {t?.pct != null ? (
                      <>
                        <strong>{Math.round(t.pct)}%</strong>{" "}
                        <span className="text-muted-foreground text-xs">
                          {t.answered} answers
                        </span>
                      </>
                    ) : (
                      "Not started"
                    )}
                  </dd>
                  {t?.pct != null && (
                    <Meter value={t.pct} label={`${label} average`} />
                  )}
                </div>
              );
            })}
          </dl>
        </>
      )}
    </HomeCard>
  );
}
export async function HomeTopics({ progress }: { progress: HomeProgress }) {
  const d = await progress;
  let topics: Topic[] | null = d?.topics ?? null;
  if (!topics) {
    try {
      const db = await createClient();
      const result = await db
        .from("topics")
        .select("id,parent_id,name,sort")
        .order("sort");
      topics = result.error ? null : result.data;
    } catch {
      topics = null;
    }
  }
  return (
    <section aria-label="Study hub" className="min-w-0">
      <HomeCard
        title="Topics"
        description="Mastery from your marked answers in the last 90 days"
        href="/student/progress"
      >
        {!topics ? (
          <TryAgain what="your topics" />
        ) : (
          <ul className="divide-y">
            {topics
              .filter((t) => !t.parent_id)
              .map((t, i) => {
                const p = d?.topics.find((p) => p.id === t.id);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/student/sprint?topics=${encodeURIComponent(t.id)}`}
                      className="grid min-h-[68px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-4"
                    >
                      <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-full text-xs">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold">{t.name}</p>
                        {p && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {p.answered} answered
                            {p.last_answered &&
                              ` · last practised ${dateLabel(p.last_answered)}`}
                          </p>
                        )}
                        {p?.pct != null && (
                          <div className="mt-2 flex items-center gap-3">
                            <Meter
                              value={p.pct}
                              label={`${t.name} mastery`}
                              className="flex-1"
                            />
                            <span className="text-xs">
                              {Math.round(p.pct)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="rounded-full border px-3 py-1.5 text-xs">
                        Practise
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </HomeCard>
    </section>
  );
}
export async function HomePlan({
  progress,
  sessions,
  due,
}: {
  progress: HomeProgress;
  sessions: HomeSessions;
  due: Promise<number | null>;
}) {
  const [d, recent, count] = await Promise.all([progress, sessions, due]);
  const unfinished = recent?.find((s) => !s.finished_at && s.kind === "sprint");
  const weak = d?.topics
    .filter((t) => t.pct != null && t.possible > 0)
    .sort((a, b) => a.pct! - b.pct!)[0];
  const actions = [
    ...(count
      ? [
          {
            href: "/student/flashcards",
            title: `Review ${count} due cards`,
            caption: "Due today",
          },
        ]
      : []),
    ...(unfinished && sessionHref(unfinished)
      ? [
          {
            href: sessionHref(unfinished)!,
            title: "Finish your last sprint",
            caption: "Pick up where you left off",
          },
        ]
      : []),
    ...(weak
      ? [
          {
            href: `/student/sprint?topics=${encodeURIComponent(weak.parent_id ?? weak.id)}${weak.parent_id ? `&sub=${encodeURIComponent(weak.id)}` : ""}`,
            title: `Practise ${weak.name || "your lowest-scoring topic"}`,
            caption: `${Math.round(weak.pct!)}% average`,
          },
        ]
      : []),
  ];
  return (
    <HomeCard
      title="Today's plan"
      description="Built from your due cards and practice history"
    >
      {!d && !recent && count == null ? (
        <TryAgain what="your study plan" />
      ) : actions.length ? (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                <Sprint
                  aria-hidden
                  className="text-muted-foreground size-5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{a.title}</p>
                  <p className="text-muted-foreground text-xs">{a.caption}</p>
                </div>
                <ArrowUpRight aria-hidden className="size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Start a sprint to build your next study steps.
        </p>
      )}
      <Link
        href="/student/mark"
        className="mt-auto border-t pt-4 text-[13px] underline"
      >
        Mark my answer
      </Link>
    </HomeCard>
  );
}
export async function HomeRecent({
  sessions,
  progress,
}: {
  sessions: HomeSessions;
  progress: HomeProgress;
}) {
  const [rows, d] = await Promise.all([sessions, progress]);
  return (
    <HomeCard
      title="Recent sessions"
      description="Pick up where you left off"
      href="/student/activity"
    >
      {rows ? (
        <SessionList sessions={rows} topics={d?.topics ?? []} />
      ) : (
        <TryAgain what="your recent sessions" />
      )}
    </HomeCard>
  );
}
export async function HomeLostMarks({ progress }: { progress: HomeProgress }) {
  const d = await progress;
  // Use leaf topics only: counting parents too would double-count lost marks.
  const rows = d?.topics
    .filter(
      (t) =>
        !d.topics.some((child) => child.parent_id === t.id) &&
        t.possible > t.earned,
    )
    .sort((a, b) => b.possible - b.earned - (a.possible - a.earned))
    .slice(0, 5);
  const max = Math.max(1, ...(rows ?? []).map((t) => t.possible - t.earned));
  return (
    <HomeCard
      title="Where your marks go"
      description="Marks dropped in the last 90 days"
      href="/student/progress"
    >
      {!d ? (
        <TryAgain what="your dropped marks" />
      ) : rows?.length ? (
        <ul className="space-y-6">
          {rows.map((t, i) => (
            <li key={t.id}>
              <Link
                href={`/student/sprint?topics=${encodeURIComponent(t.parent_id ?? t.id)}${t.parent_id ? `&sub=${encodeURIComponent(t.id)}` : ""}`}
                className="mb-2 flex justify-between gap-3 text-[13px]"
              >
                <span>{t.name}</span>
                <span className="shrink-0">{t.possible - t.earned} marks</span>
              </Link>
              <Meter
                value={(100 * (t.possible - t.earned)) / max}
                tone={i === 0 ? "brand" : undefined}
                label={`${t.name} marks dropped`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No dropped marks in this range.
        </p>
      )}
    </HomeCard>
  );
}
