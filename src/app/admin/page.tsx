import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle, PortalIcon } from "@/components/icons";
import { requireAdmin } from "@/lib/auth";
import { loadDashboard } from "@/lib/admin-data";
import { ago } from "@/lib/admin";
import { lastWeek, spendMeter } from "@/lib/admin-dashboard";
import { modeLabel, percentage, plural, scoreTone } from "@/lib/practice";
import { DailyChart } from "@/components/daily-chart";
import { LatestSessions } from "@/components/latest-sessions";
import { EmptyState, Meter, PageHeader, Skeleton } from "@/components/claro";
import { StatCard } from "@/components/claro/data-display";
import { TryAgain } from "@/components/try-again";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const usd = (n: number) => `$${n.toFixed(2)}`;

async function Dashboard() {
  await requireAdmin();
  const d = await loadDashboard().catch(() => null);
  if (!d)
    return (
      <>
        <div className="card-row grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            "Active students, 7 days",
            "Sessions, 7 days",
            "Open reviews",
            "Spend this month",
          ].map((title) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TryAgain what="this" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="card-row grid gap-4 xl:grid-cols-2">
          {["Needs attention", "Sessions per day", "Recent sessions"].map(
            (title) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TryAgain what="this" />
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </>
    );
  const week = lastWeek(d.sessionsPerDay);
  const fortnight = d.sessionsPerDay.slice(-14);
  const fortnightTotal = fortnight.reduce((sum, p) => sum + p.value, 0);
  const meter = spendMeter(d.spend.month, d.spend.cap);
  const capPct = Math.round((100 * d.spend.all) / d.spend.cap);
  const attention = [
    [
      d.openReviews.count,
      d.openReviews.oldestDays == null
        ? "open mark reviews"
        : `open mark reviews · oldest waiting ${plural(d.openReviews.oldestDays, "day")}`,
      "/admin/marking/review?tab=open",
    ],
    [
      d.attention.failed,
      "failed or unreadable marks in the last 7 days",
      "/admin/marking/review?tab=failed",
    ],
    [d.attention.newFeedback, "new feedback", "/admin/feedback?status=new"],
    [
      d.attention.contentReports,
      "content reports not resolved",
      "/admin/feedback?kind=content&status=unresolved",
    ],
    [
      d.attention.importReview,
      "drafts in import review",
      "/admin/content/questions?status=review",
    ],
    [
      d.spend.all >= d.spend.cap * 0.8 ? 1 : 0,
      `all-time spend at ${capPct}% of the cap`,
      "/admin/spend",
    ],
    [
      d.attention.agreement != null && d.attention.agreement < 85 ? 1 : 0,
      `check agreement ${(Math.floor((d.attention.agreement ?? 0) * 10) / 10).toFixed(1)}% this week`,
      "/admin/marking/accuracy",
    ],
  ] as const;
  const rows = attention.filter(([n]) => n > 0);
  return (
    <>
      <div className="card-row grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active students, 7 days"
          value={d.active.now}
          delta={d.active.now - d.active.prev}
          description={`vs ${d.active.prev} the week before`}
        />
        <StatCard
          title="Sessions, 7 days"
          value={week.now}
          delta={week.delta ?? undefined}
          description={
            week.delta == null
              ? "Finished sessions"
              : `vs ${week.now - week.delta} the week before`
          }
        />
        <StatCard
          title="Open reviews"
          value={d.openReviews.count}
          description={
            d.openReviews.oldestDays == null
              ? "Nothing waiting"
              : `Oldest waiting ${plural(d.openReviews.oldestDays, "day")}`
          }
        />
        <Card data-component="StatCard" className="h-full gap-3">
          <CardHeader>
            <p className="text-muted-foreground text-xs">Spend this month</p>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/spend"
              className="num-display text-2xl leading-none font-bold underline-offset-4 hover:underline sm:text-[28px]"
            >
              {usd(d.spend.month)}
            </Link>
            <div
              role="progressbar"
              aria-label="Spend this month against the cap"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={meter.pct}
              aria-valuetext={`${meter.text} (${meter.pct}%)`}
              className="mt-3"
            >
              <span aria-hidden="true">
                <Meter
                  value={meter.pct}
                  tone="brand"
                  label="Spend this month against the cap"
                />
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Month to date · {meter.text} cap
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="card-row grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Needs attention
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              Each row opens the right page.
            </p>
          </CardHeader>
          <CardContent>
            {rows.length ? (
              <ul className="divide-y">
                {rows.map(([n, text, href]) => (
                  <li key={href + text}>
                    <Link
                      href={href}
                      className="hover:bg-accent -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 text-sm"
                    >
                      <Badge variant="brand" className="min-w-7 tabular-nums">
                        {n}
                      </Badge>
                      <span className="min-w-0 flex-1">{text}</span>
                      <PortalIcon
                        name="chevron-right"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <CheckCircle className="size-4 shrink-0" />
                All clear. Nothing needs attention right now.
              </p>
            )}
          </CardContent>
        </Card>
        <DailyChart
          title="Sessions per day"
          description={`Finished sessions, last ${plural(fortnight.length, "Sydney day")}`}
          hero={plural(fortnightTotal, "session")}
          points={fortnight}
          kind="area"
          dayPicker={false}
        />
      </div>
      <Card className="min-w-0">
        <CardHeader className="grid-cols-[1fr_auto]">
          <CardTitle role="heading" aria-level={2}>
            Recent sessions
          </CardTitle>
          <Link
            href="/admin/students"
            className="text-sm font-semibold underline underline-offset-4"
          >
            All students
          </Link>
        </CardHeader>
        <CardContent>
          {d.students === 0 ? (
            <EmptyState
              title="No students yet"
              description="Sessions appear here once students sign up and finish a sprint."
            />
          ) : !d.latest.length ? (
            <EmptyState
              title="No finished sessions yet"
              description="Finished sessions will appear here."
            />
          ) : (
            <LatestSessions
              rows={d.latest.map((s) => ({
                id: s.id,
                user_id: s.user_id,
                name: s.name,
                kind:
                  s.kind === "flashcards"
                    ? "Flashcards"
                    : s.kind === "single"
                      ? "Mark my answer"
                      : s.kind === "sprint"
                        ? `${modeLabel(s.mode ?? undefined)} sprint`
                        : "Removed session",
                score: percentage(s.score, s.max),
                tone:
                  s.max && s.score != null
                    ? scoreTone((100 * s.score) / s.max)
                    : null,
                when: ago(s.finished_at),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

export const metadata = pageMetadata("Dashboard");

export default function AdminHome() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Students, marking and spend at a glance."
      />
      <Suspense
        fallback={
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </>
        }
      >
        <Dashboard />
      </Suspense>
    </div>
  );
}
