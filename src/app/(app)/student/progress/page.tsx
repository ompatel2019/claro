import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { loadProgress, progressToday } from "@/lib/progress-data";
import { parseRange, rangeFrom, practiseHref, weakSpots } from "@/lib/progress";
import { weakTopicUnlock } from "@/lib/weak-topics";
import { addDays, type ActivityDay } from "@/lib/activity";
import { createClient } from "@/utils/supabase/server";
import { PageHeader } from "@/components/claro/layout";
import { ProgressControls } from "@/components/progress-controls";
import {
  TopicProgressTable,
  VerbProgressTable,
} from "@/components/progress-tables";
import {
  PracticeGauge,
  ProgressChart,
} from "@/components/student/progress/charts";
import { Meter } from "@/components/claro/data-display";
import { PortalIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";

function Section({
  title,
  caption,
  children,
  className = "",
  flush = false,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      data-slot="card"
      className={`bg-card shadow-card min-w-0 gap-0 overflow-hidden rounded-2xl border py-0 ${className}`}
    >
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
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
  await requireProfile();
  const p = await searchParams,
    range = parseRange(p.range),
    today = progressToday();
  const d = await loadProgress(range, today);
  const db = await createClient();
  const volume = await db.rpc("activity_days", {
    p_from: rangeFrom(range, today) ?? addDays(today, -364),
    p_to: today,
  });
  const parents = d.topics.filter((t) => !t.parent_id);
  const earned = parents.reduce((n, t) => n + t.earned, 0),
    possible = parents.reduce((n, t) => n + t.possible, 0),
    answered = parents.reduce((n, t) => n + t.answered, 0);
  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  const history = d.history
    .filter(
      (s) =>
        (!p.kind || s.kind === p.kind) &&
        (!p.type || s.by_type[String(p.type)] != null),
    )
    .map((s) =>
      typeof p.type === "string" ? { ...s, pct: s.by_type[p.type] ?? null } : s,
    );
  const weak = weakSpots(d.topics, d.missed);
  const unlocked = weak
    .filter((r) => r.id.startsWith("q-"))
    .slice(0, d.missed.some((c) => c.missed > 0) ? 1 : 2);
  const locked = d.topics
    .filter((t) => t.parent_id && t.answered > 0 && weakTopicUnlock(t))
    .slice(0, 2);
  return (
    <div
      className="min-w-0 space-y-5 overflow-hidden"
      data-testid="progress-page"
      data-range={range}
    >
      <PageHeader
        title="Progress"
        description="See where your marks come from and make your next session count."
        actions={<ProgressControls range={range} />}
      />
      <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Section
          title="Practice average"
          caption={`${answered} marked answers ${range === "all" ? "across all time" : range === "year" ? "this year" : `in the last ${range} days`}`}
          className="min-h-[316px] xl:min-h-[364px]"
        >
          <div className="pt-3 pb-4">
            <PracticeGauge value={pct} />
          </div>
          <div className="text-muted-foreground grid grid-cols-2 gap-3 border-t pt-4 text-[13px]">
            <div>
              Marks earned
              <p className="text-foreground mt-1 text-[15px] font-semibold">
                {earned} / {possible}
              </p>
            </div>
            <div>
              Questions answered
              <p className="text-foreground mt-1 text-[15px] font-semibold">
                {answered}
              </p>
            </div>
          </div>
        </Section>
        <Section
          title="Practice average over time"
          caption="Weekly average of your finished sessions"
          className="xl:col-span-2"
        >
          <ProgressChart history={history} />
          <details className="text-muted-foreground mt-2 text-xs">
            <summary className="cursor-pointer">Filter score history</summary>
            <div className="mt-3">
              <ProgressControls range={range} filters />
            </div>
          </details>
        </Section>
        <Section
          title="Marks by topic"
          caption="Open a topic to see its dot points"
          className="md:col-span-2 xl:col-span-3"
          flush
        >
          <TopicProgressTable rows={d.topics} />
        </Section>
        <Section
          title="Questions answered"
          caption="Per week. Volume first, then accuracy."
          className="xl:min-h-[362px]"
        >
          <ProgressChart
            history={[]}
            days={((volume.data ?? []) as ActivityDay[]).filter(
              (d) =>
                d.day <= today && d.day >= (rangeFrom(range, today) ?? "0000"),
            )}
            volume
          />
        </Section>
        <Section
          title="By question type"
          caption="Average mark for each kind of question"
          className="xl:min-h-[362px]"
        >
          <ul className="grid gap-4">
            {[
              ["mcq", "Multiple choice"],
              ["short", "Short answer"],
              ["extended", "Extended response"],
            ].map(([id, label]) => {
              const t = d.types.find((t) => t.id === id);
              return (
                <li key={id} className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-muted-foreground text-[13px]">
                      {t?.answered && t.pct != null ? (
                        <>
                          <b className="text-foreground text-[15px] font-semibold">
                            {Math.round(t.pct)}%
                          </b>{" "}
                          · {t.answered} answers
                        </>
                      ) : (
                        "Not started"
                      )}
                    </span>
                  </div>
                  {t?.answered && t.pct != null ? (
                    <Meter
                      value={t.pct}
                      label={`${label} average`}
                      className="h-2"
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
                      <span className="text-muted-foreground text-[13px]">
                        Try a {label.toLowerCase()} question.
                      </span>
                      <Link
                        href={`/student/sprint?type=${id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Try one
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
        <Section
          title="By directive verb"
          caption="Verbs with at least 3 answers. Start with the lowest."
          className="xl:min-h-[362px]"
        >
          <VerbProgressTable rows={d.verbs} />
          {!d.verbs.some((v) => v.answered >= 3) && (
            <p className="text-muted-foreground text-sm">
              Answer at least 3 questions with the same directive verb to see a
              comparison.
            </p>
          )}
          <p className="text-muted-foreground mt-5 text-xs">
            “Analyse” answers need a judgement on how things interact. Practise
            these in Mark my answer.
          </p>
        </Section>
        <Section
          title="Weak spots"
          caption="Unlock after 3 marked answers across 2 sessions in a dot point. Cards you rate Missed or Mostly appear with them."
          className="md:col-span-2 xl:col-span-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {unlocked.slice(0, 2).map((r) => {
              const t = d.topics.find((t) => t.id === r.id.slice(2))!;
              const cards = d.missed.find((c) => c.id === t.id);
              return (
                <div
                  key={r.id}
                  className="flex min-h-[170px] flex-col gap-3 rounded-2xl border p-4 xl:min-h-[210px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{r.name}</h3>
                      <p className="text-muted-foreground text-xs">
                        {d.topics.find((p) => p.id === t.parent_id)?.name}
                      </p>
                    </div>
                    <strong className="text-xl">{Math.round(t.pct!)}%</strong>
                  </div>
                  <Meter
                    value={t.pct!}
                    tone="brand"
                    label={`${t.name} average`}
                  />
                  <p className="text-muted-foreground text-[13px]">
                    {t.answered} questions answered
                    {cards ? ` · ${cards.missed} cards to review` : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link
                      href={r.href}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Retry questions
                    </Link>
                    {cards && (
                      <Link
                        href={`/student/flashcards?topic=${encodeURIComponent(t.id)}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Review cards
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
            {weak
              .filter(
                (r) =>
                  r.id.startsWith("c-") &&
                  !unlocked.some((q) => q.id.slice(2) === r.id.slice(2)),
              )
              .slice(0, Math.max(0, 2 - unlocked.length))
              .map((r) => (
                <div
                  key={r.id}
                  className="flex min-h-[170px] flex-col gap-3 rounded-2xl border p-4 xl:min-h-[210px]"
                >
                  <h3 className="text-sm font-semibold">{r.name}</h3>
                  <p className="text-muted-foreground text-[13px]">
                    {r.caption}
                  </p>
                  <Link
                    href={r.href}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "mt-auto",
                    })}
                  >
                    Review cards
                  </Link>
                </div>
              ))}
            {locked.map((t) => (
              <div
                key={t.id}
                className="flex min-h-[170px] flex-col gap-3 rounded-2xl border border-dashed p-4 xl:min-h-[210px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <PortalIcon
                    name="lock"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {t.answered >= 3 && t.sessions === 1
                    ? "Practise in one more session to unlock."
                    : weakTopicUnlock(t)}
                </p>
                <div className="mt-auto">
                  {t.sessions != null && (
                    <>
                      <p className="text-muted-foreground mb-1 flex justify-between text-[11px]">
                        <span>Sessions</span>
                        <span>{Math.min(t.sessions, 2)} of 2</span>
                      </p>
                      <Meter
                        value={Math.min((t.sessions / 2) * 100, 100)}
                        label={`${t.name} sessions toward unlocking`}
                        className="mb-3"
                      />
                    </>
                  )}
                  <Link
                    href={practiseHref(t)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "w-full",
                    })}
                  >
                    Practise now
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {!weak.length && !locked.length && (
            <p className="text-muted-foreground text-sm">
              Practise questions or review flashcards to find where to focus
              next.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
