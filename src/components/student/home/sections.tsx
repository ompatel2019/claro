import { PRACTICE_TARGET } from "@/lib/progress";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode, ComponentProps } from "react";
import { createClient } from "@/utils/supabase/server";
import type { ProgressData } from "@/lib/progress";
import { practiseHref } from "@/lib/progress";
import { sydneyToday } from "@/lib/flashcards";
import { addDays, type ActivityDay } from "@/lib/activity";
import { type Session, type Topic } from "@/lib/practice";
import { isWeakTopic } from "@/lib/weak-topics";
import { sessionHref } from "@/lib/session-summary";
import {
  homeEarnedMarks,
  homeUnits,
  homeWeeks,
  homeComparison,
  homeMinutes,
  homeShortDate,
  homeSprintMinutes,
} from "@/lib/home";
import { DEFAULTS } from "@/lib/sprint";
import { examDaysLeft } from "@/lib/hsc-exam";
import { Card } from "@/components/ui/card";
import { TryAgain } from "@/components/try-again";
import { SessionList } from "@/components/session-list";
import { WeeklyAverageTrend } from "@/components/score-trend";
import {
  Meter,
  DeltaPill,
  Sparkline,
  Ring,
  BarList,
} from "@/components/claro/data-display";
import { PortalIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
export type HomeProgress = Promise<ProgressData | null>;
export type HomeSession = Session & {
  recall?: { knew: number; total: number };
};
export type HomeSessions = Promise<HomeSession[] | null>;

/** Read only dated earned marks. Page narrow projections to avoid PostgREST row caps. */
export async function readHomeMarks(userId: string, today: string) {
  try {
    const db = await createClient();
    const rows: { mark: number | null; marked_at: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from("attempts")
        .select("mark,marked_at")
        .eq("user_id", userId)
        .eq("status", "marked")
        // UTC bounds enclose all fourteen Sydney days, including DST transitions.
        .gte("marked_at", `${addDays(today, -14)}T00:00:00Z`)
        .lt("marked_at", `${addDays(today, 1)}T00:00:00Z`)
        .order("id")
        .range(offset, offset + 999);
      if (error) return null;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (
      !rows.some(
        (row) =>
          row.mark != null &&
          row.marked_at &&
          Number.isFinite(Date.parse(row.marked_at)),
      )
    )
      return null;
    return homeEarnedMarks(rows, today);
  } catch {
    return null;
  }
}
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
export async function readHomeUnfinishedSprint(
  userId: string,
): Promise<Session | null> {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .is("finished_at", null)
      .eq("kind", "sprint")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return error ? null : (data as Session | null);
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

type IconName = ComponentProps<typeof PortalIcon>["name"];
export function HomeCard({
  title,
  description,
  href,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  href?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`h-full min-w-0 gap-4 p-5 ${className}`}>
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-1 text-[13px]">
              {description}
            </p>
          )}
        </div>
        {action ??
          (href && (
            <Link
              href={href}
              aria-label={`Open ${title}`}
              className="text-muted-foreground flex shrink-0 items-center gap-1 text-[13px]"
            >
              {href.includes("activity") ? "Activity" : "Progress"}
              <PortalIcon name="arrow-up-right" className="size-3.5" />
            </Link>
          ))}
      </div>
      {children}
    </Card>
  );
}
export async function HomeStats({
  progress,
  due,
  today = sydneyToday(),
  activity,
  marks,
}: {
  progress: HomeProgress;
  due: Promise<number | null>;
  today?: string;
  activity?: Promise<ActivityDay[]>;
  marks?: ReturnType<typeof readHomeMarks>;
}) {
  const [d, count, days, earnedMarks] = await Promise.all([
    progress,
    due,
    activity ?? Promise.resolve([]),
    marks ?? Promise.resolve(null),
  ]);
  const parents = d ? homeUnits(d.topics) : undefined;
  const seconds = d?.history
    .filter((s) => s.finished_at && Number.isFinite(Date.parse(s.finished_at)))
    .reduce((n, s) => n + (Number.isFinite(s.elapsed_s) ? s.elapsed_s : 0), 0);
  const comparison = homeComparison(d?.history ?? [], today);
  const current = days.filter(
    (day) => day.day >= addDays(today, -6) && day.day <= today,
  );
  const previous = days.filter(
    (day) => day.day >= addDays(today, -13) && day.day < addDays(today, -6),
  );
  const questions = (rows: ActivityDay[]) =>
    rows.reduce((n, day) => n + day.questions, 0);
  const weeklySeconds = Array.from(
    { length: 7 },
    (_, i) =>
      d?.history
        .filter(
          (s) =>
            s.finished_at &&
            Number.isFinite(Date.parse(s.finished_at)) &&
            sydneyToday(new Date(s.finished_at)) === addDays(today, i - 6),
        )
        .reduce((n, s) => n + s.elapsed_s, 0) ?? 0,
  );
  const stats: {
    title: string;
    value: ReactNode;
    href: string;
    icon: IconName;
    values?: number[];
    delta?: number;
    unit?: string;
  }[] = [
    {
      title: "Marks earned",
      value: parents?.reduce((n, t) => n + t.earned, 0),
      href: "/student/progress",
      icon: "target",
      values: earnedMarks?.values,
      delta: earnedMarks?.delta,
    },
    {
      title: "Questions answered",
      value: parents?.reduce((n, t) => n + t.answered, 0),
      href: "/student/sprint",
      icon: "list-checks",
      values: days.length
        ? Array.from(
            { length: 7 },
            (_, i) =>
              days.find((d) => d.day === addDays(today, i - 6))?.questions ?? 0,
          )
        : undefined,
      delta: previous.length
        ? questions(current) - questions(previous)
        : undefined,
    },
    {
      title: "Study time",
      value:
        seconds == null
          ? undefined
          : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`,
      href: "/student/activity",
      icon: "clock",
      values: d?.history.length ? weeklySeconds : undefined,
      delta: comparison.minutes,
      unit: "m",
    },
    {
      title: "Cards due",
      value: count,
      href: "/student/flashcards",
      icon: "copy",
    },
  ];
  return (
    <section
      aria-label="Quick start"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5"
    >
      {stats.map((s, i) => (
        <Link
          key={s.title}
          href={s.href}
          className="bg-card shadow-card hover:border-foreground/20 flex min-h-[152px] flex-col justify-between rounded-xl border p-5 focus-visible:outline-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-[13px]">{s.title}</h2>
            <span className="bg-muted text-muted-foreground grid size-8 place-items-center rounded-lg">
              <PortalIcon name={s.icon} className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-[30px] leading-none font-bold tracking-[-0.035em] tabular-nums">
              {s.value ?? "Unavailable"}
            </p>
            {s.values && (
              <Sparkline values={s.values} label={`${s.title} trend`} />
            )}
            {i === 3 && (
              <span className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] shadow-xs">
                Review now <PortalIcon name="arrow-right" className="size-4" />
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
            {i === 3 ? (
              `${d?.due.find((r) => r.day === addDays(today, 1))?.count ?? 0} due tomorrow`
            ) : s.delta !== undefined ? (
              <>
                <DeltaPill delta={s.delta} unit={s.unit} />
                vs previous 7 days
              </>
            ) : (
              "Last 90 days"
            )}
          </div>
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
  const parents = homeUnits(d?.topics ?? []),
    earned = parents.reduce((n, t) => n + t.earned, 0),
    possible = parents.reduce((n, t) => n + t.possible, 0);
  const comparison = homeComparison(d?.history ?? [], today);
  return (
    <HomeCard
      title="Practice average"
      description="Weekly average across your marked answers"
      action={
        <Link
          href="/student/progress"
          aria-label="Open practice average history"
          className="text-muted-foreground absolute top-0 right-0 p-2"
        >
          <PortalIcon name="table" className="size-4" />
        </Link>
      }
    >
      {!d ? (
        <TryAgain what="your practice average" />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <p className="text-[48px] leading-[.9] font-bold tracking-[-0.045em]">
              {possible
                ? `${Math.round((100 * earned) / possible)}%`
                : "No marks yet"}
            </p>
            {comparison.score !== undefined && (
              <p className="text-muted-foreground flex items-center gap-1.5 pb-1 text-[13px]">
                <DeltaPill delta={comparison.score} unit=" pts" />
                vs previous 7 days
              </p>
            )}
            <p className="text-muted-foreground ml-auto flex items-center gap-2 pb-1 text-[13px]">
              <span className="border-muted-foreground inline-block w-5 border-t-[1.5px] border-dashed" />
              Your target{" "}
              <span className="text-foreground font-semibold">
                {PRACTICE_TARGET}%
              </span>
            </p>
          </div>
          <div className="mt-1">
            <WeeklyAverageTrend points={homeWeeks(d.history)} />
          </div>
          <dl className="mt-1 grid grid-cols-3 gap-4 border-t pt-4">
            {[
              ["mcq", "Multiple choice"],
              ["short", "Short answer"],
              ["extended", "Extended response"],
            ].map(([id, label]) => {
              const t = d.types.find((t) => t.id === id);
              const started = !!t?.answered && t.pct != null;
              return (
                <div key={id} className="min-w-0">
                  <dt className="text-muted-foreground truncate text-xs">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[15px] font-semibold">
                    {started ? (
                      <>
                        {Math.round(t.pct!)}%{" "}
                        <span className="text-muted-foreground text-xs font-normal">
                          {t.answered} answers
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not started</span>
                    )}
                  </dd>
                  {started ? (
                    <Meter
                      value={t.pct!}
                      label={`${label} average`}
                      className="mt-2"
                    />
                  ) : (
                    <Link
                      href="/student/mark"
                      className="mt-1.5 inline-flex text-xs underline underline-offset-4"
                    >
                      Try one
                    </Link>
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
  const topics = d?.topics ?? (await readHomeTopics());
  const units = topics
    ?.filter((t) => t.parent_id === null)
    .sort((a, b) => a.sort - b.sort);
  const focus = homeUnits(d?.topics ?? [])
    .filter((t) => t.answered > 0 && t.pct != null)
    .sort((a, b) => a.pct! - b.pct!)[0]?.id;
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
          <ul className="-mx-2 divide-y">
            {units?.map((t, i) => {
              const p = d?.topics.find((p) => p.id === t.id),
                isFocus = t.id === focus;
              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-2 py-3.5 sm:grid-cols-[28px_minmax(0,1fr)_minmax(140px,220px)_auto]"
                >
                  <span className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{t.name}</span>
                      {isFocus && (
                        <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[11px] font-medium">
                          Focus
                        </span>
                      )}
                    </p>
                    {p && (
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {p.answered} answered
                        {p.last_answered &&
                          ` · last practised ${homeShortDate(p.last_answered)}`}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 col-start-2 flex items-center gap-3 sm:col-span-1 sm:col-start-auto">
                    {p?.pct != null && (
                      <>
                        <Meter
                          value={p.pct}
                          tone={isFocus ? "brand" : "default"}
                          label={`${t.name} mastery`}
                          className="h-2"
                        />
                        <span className="w-11 shrink-0 text-right text-sm font-semibold">
                          <span className="relative inline-block">
                            {Math.round(p.pct)}%
                            {isFocus && (
                              <svg
                                viewBox="0 0 50 34"
                                className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[34px] w-[50px] overflow-visible"
                                aria-label="lowest topic"
                              >
                                <path
                                  d="M43 8C33-2 6 1 3 15C-2 32 29 37 43 27C55 17 44 3 28 2"
                                  fill="none"
                                  stroke="var(--brand)"
                                  strokeWidth="1.5"
                                />
                              </svg>
                            )}
                          </span>
                        </span>
                      </>
                    )}
                  </div>
                  <Link
                    href={practiseHref(t)}
                    className={cn(
                      buttonVariants({
                        variant: isFocus ? "default" : "outline",
                        size: "sm",
                      }),
                      "col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto",
                    )}
                  >
                    Practise
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
  unfinished: open,
  due,
  today = sydneyToday(),
}: {
  progress: HomeProgress;
  sessions: HomeSessions;
  unfinished?: Promise<Session | null>;
  due: Promise<number | null>;
  today?: string;
}) {
  const [d, recent, count, unfinished] = await Promise.all([
    progress,
    sessions,
    due,
    open ??
      sessions.then(
        (s) => s?.find((s) => !s.finished_at && s.kind === "sprint") ?? null,
      ),
  ]);
  const weak =
    d &&
    homeUnits(d.topics)
      .filter(isWeakTopic)
      .sort((a, b) => a.pct! - b.pct!)[0];
  const done = recent?.find(
    (s) =>
      s.kind === "sprint" &&
      s.finished_at &&
      sydneyToday(new Date(s.finished_at)) === today,
  );
  const items: {
    href: string;
    title: string;
    caption: string;
    minutes: number | null;
    icon: IconName;
    done?: boolean;
  }[] = [];
  if (done)
    items.push({
      href: sessionHref(done)!,
      title: `Sprint on ${d?.topics.find((t) => t.id === (done.config.subtopics?.[0] ?? done.config.topics?.[0]))?.name ?? "your selected topics"}`,
      caption: `Done at ${new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }).format(new Date(done.finished_at!)).replace(/\s/g, "")}${done.max_score ? ` · ${Math.round((100 * (done.score ?? 0)) / done.max_score)}%` : ""}`,
      minutes: 0,
      icon: "check",
      done: true,
    });
  if (count)
    items.push({
      href: "/student/flashcards",
      title: `Review ${count} due cards`,
      caption: "Due today",
      minutes: homeMinutes(count, "cards"),
      icon: "copy",
    });
  if (unfinished)
    items.push({
      href: sessionHref(unfinished)!,
      title: "Finish your last sprint",
      caption: "Pick up where you left off",
      minutes: homeSprintMinutes(unfinished.config, unfinished.elapsed_s),
      icon: "list-checks",
    });
  if (weak && items.length < 3)
    items.push({
      href: practiseHref(weak),
      title: `Practise ${weak.name}`,
      caption: `${Math.round(weak.pct!)}% average`,
      minutes: homeMinutes(DEFAULTS.target, "questions"),
      icon: "zap",
    });
  const next = items.find((p) => !p.done),
    completed = items.filter((p) => p.done).length,
    days = examDaysLeft(today);
  return (
    <HomeCard
      title="Today's plan"
      description="Built from your due cards and weak spots"
      action={
        <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
          <span>
            {completed} of {items.length}
          </span>
          <Ring value={completed} max={items.length} size={28} stroke={3.5} />
        </span>
      }
    >
      {!d && !recent && !unfinished && count == null ? (
        <TryAgain what="your study plan" />
      ) : items.length ? (
        <ol className="grid min-w-0 grid-cols-1 gap-2">
          {items.map((a) => (
            <li key={a.href} className="min-w-0">
              <Link
                href={a.href}
                className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${a.done ? "bg-muted/60 border-transparent" : "hover:bg-accent"}`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${a.done ? "bg-success-soft text-success-text" : "bg-muted"}`}
                >
                  <PortalIcon name={a.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-semibold ${a.done ? "text-muted-foreground" : ""}`}
                  >
                    {a.title}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {a.caption}
                  </span>
                </span>
                {!a.done && (
                  <>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {a.minutes != null ? `~${a.minutes} min` : ""}
                    </span>
                    <PortalIcon
                      name="chevron-right"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </>
                )}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">
          Start a sprint to build your next study steps.
        </p>
      )}
      {next && (
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground text-xs">
            {items.every((p) => p.minutes != null)
              ? `About ${items.reduce((n, p) => n + (p.minutes ?? 0), 0)} minutes left`
              : "Your next study steps"}
            {days != null && ` · exam in ${days} days`}
          </p>
          <Link
            href={next.href}
            className={`${buttonVariants({ size: "sm" })} shrink-0`}
          >
            Start next <PortalIcon name="arrow-right" className="size-4" />
          </Link>
        </div>
      )}
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
  const topics = d?.topics ?? (await readHomeTopics());
  return (
    <HomeCard
      title="Recent sessions"
      description="Pick up where you left off"
      href="/student/activity"
      className="xl:min-h-[390px]"
    >
      {rows ? (
        <SessionList home sessions={rows} topics={topics ?? []} />
      ) : (
        <TryAgain what="your recent sessions" />
      )}
    </HomeCard>
  );
}
export async function HomeLostMarks({ progress }: { progress: HomeProgress }) {
  const d = await progress;
  const rows = d?.topics
    .filter((t) => t.parent_id && t.possible > t.earned)
    .sort((a, b) => b.possible - b.earned - (a.possible - a.earned))
    .slice(0, 5);
  return (
    <HomeCard
      title="Where your marks go"
      description="Marks dropped in the last 90 days"
      href="/student/progress"
      className="min-h-[390px]"
    >
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
