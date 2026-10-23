import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { loadProgress, progressToday } from "@/lib/progress-data";
import { parseRange, rangeFrom, PRACTICE_TARGET } from "@/lib/progress";
import type { ActivityDay } from "@/lib/activity";
import { createClient } from "@/utils/supabase/server";
import { PageHeader } from "@/components/claro/layout";
import { ProgressControls } from "@/components/progress-controls";
import { TopicProgressTable } from "@/components/progress-tables";
import { ProgressChart } from "@/components/student/progress/charts";
import { PracticeDays } from "@/components/student/progress/practice-days";
import { Meter } from "@/components/claro/data-display";
import { buttonVariants } from "@/components/ui/button";
import { HomeLostMarks } from "@/components/student/home/sections";

function Section({
  title,
  caption,
  children,
  flush = false,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section
      data-slot="card"
      className="bg-card shadow-card relative min-w-0 gap-0 overflow-hidden rounded-2xl border py-0"
    >
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-lg leading-6 font-semibold">{title}</h2>
        {caption && (
          <p className="text-muted-foreground mt-1 text-[13px]">{caption}</p>
        )}
      </div>
      <div className={flush ? "pb-5" : "px-5 pb-5"}>{children}</div>
    </section>
  );
}
export const metadata = pageMetadata("Progress");
export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const p = await searchParams,
    range = parseRange(p.range),
    today = progressToday();
  const d = await loadProgress(range, today);
  const db = await createClient();
  const [volume, due] = await Promise.all([
    db.rpc("activity_days", {
      p_from: rangeFrom(range, today),
      p_to: today,
    }),
    db
      .from("flashcard_progress")
      .select("flashcard_id,flashcards!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("flashcards.status", "live")
      .eq("user_id", profile.id)
      .lte("due_on", today),
  ]);
  const parents = d.topics.filter((t) => !t.parent_id);
  const earned = parents.reduce((n, t) => n + t.earned, 0),
    possible = parents.reduce((n, t) => n + t.possible, 0),
    answered = parents.reduce((n, t) => n + t.answered, 0);
  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  const history = d.history
    .filter(
      (s) =>
        s.kind !== "flashcards" &&
        (!p.kind || s.kind === p.kind) &&
        (!p.type || s.by_type[String(p.type)] != null),
    )
    .map((s) =>
      typeof p.type === "string" ? { ...s, pct: s.by_type[p.type] ?? null } : s,
    );

  const days = volume.error ? null : ((volume.data ?? []) as ActivityDay[]);
  const seconds = d.history
    .filter(
      (row) => row.finished_at && Number.isFinite(Date.parse(row.finished_at)),
    )
    .reduce(
      (sum, row) => sum + (Number.isFinite(row.elapsed_s) ? row.elapsed_s : 0),
      0,
    );
  const stats = [
    ["Marks earned", `${earned}/${possible}`],
    ["Questions answered", answered],
    [
      "Days studied",
      days
        ? days.filter((day) => day.questions + day.cards > 0).length
        : "Unavailable",
    ],
    [
      "Study time",
      `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`,
    ],
  ] as const;
  return (
    <div
      className="progress-page min-w-0 space-y-6"
      data-testid="progress-page"
      data-range={range}
    >
      <PageHeader
        title="Progress"
        eyebrow="From your marked answers"
        actions={<ProgressControls range={range} />}
      />
      <Section
        title="Practice average"
        caption={`${answered ? `${pct}% across ${answered} marked answers` : "No marked answers yet"} · Your target is ${PRACTICE_TARGET}%`}
      >
        <ProgressChart history={history}>
          <details className="text-muted-foreground mt-2 text-xs">
            <summary className="cursor-pointer">Filter score history</summary>
            <div className="mt-3">
              <ProgressControls range={range} filters />
            </div>
          </details>
        </ProgressChart>
        {answered === 0 && (
          <Link
            href="/student/sprint"
            className={buttonVariants({ className: "mt-4" })}
          >
            Start a sprint
          </Link>
        )}
      </Section>
      <Section
        title="Marks by topic"
        caption="Share of marks earned, weakest first. Open a topic for its dot points."
        flush
      >
        <TopicProgressTable rows={d.topics} />
      </Section>
      <Section
        title="Your practice"
        caption={
          range === "all"
            ? "Across all time"
            : range === "year"
              ? "This year"
              : `In the last ${range} days`
        }
      >
        <dl className="grid grid-cols-2 gap-5 xl:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-5 border-t pt-4 text-sm">
          <Link
            className="text-foreground font-semibold underline underline-offset-4"
            href="/student/flashcards"
          >
            Cards due: {due.error ? "Unavailable" : (due.count ?? 0)}
          </Link>{" "}
          · Previously studied cards whose saved review date has arrived. This
          count is for today.
        </p>
      </Section>
      <div className="grid items-start gap-6 xl:grid-cols-[7fr_5fr]">
        <div className="progress-loss">
          <HomeLostMarks
            progress={Promise.resolve(d)}
            caption="Marks dropped in this range, by dot point. Practise a dot point to improve it."
          />
        </div>
        <div className="min-w-0 space-y-6">
          <Section
            title="By question type"
            caption="Share of marks earned in this range"
          >
            <ul className="divide-y">
              {(
                [
                  ["mcq", "Multiple choice"],
                  ["short", "Short answer"],
                  ["extended", "Extended response"],
                ] as const
              ).map(([id, label]) => {
                const row = d.types.find((r) => r.id === id);
                return (
                  <li key={id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-semibold">{label}</span>
                      <span className="tabular-nums">
                        {row?.pct == null
                          ? "Not started"
                          : `${Math.round(row.pct)}%`}
                      </span>
                    </div>
                    {row?.pct != null && (
                      <Meter
                        value={row.pct}
                        label={`${label} average`}
                        className="mt-2"
                      />
                    )}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {row?.answered ?? 0} answered
                      </span>
                      <Link
                        href={`/student/sprint?type=${id}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        Practise<span className="sr-only"> {label}</span>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Practice days" caption="Small sessions add up">
            <PracticeDays
              days={days}
              today={today}
              from={rangeFrom(range, today)}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
