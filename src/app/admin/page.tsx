import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, CheckCircle, PortalIcon } from "@/components/icons";
import { requireAdmin } from "@/lib/auth";
import { loadDashboard } from "@/lib/admin-data";
import { ago } from "@/lib/admin";
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            "Active students, 7 days",
            "Sessions, last 7 days",
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
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            "Sessions per day",
            "AI spend, last 7 days",
            "Recent sessions",
            "Needs attention",
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
      </>
    );
  const sessions = d.sessionsPerDay.slice(-7);
  const spend = d.spendPerDay.slice(-7);
  const sessionTotal = sessions.reduce((sum, point) => sum + point.value, 0);
  const spendTotal = spend.reduce((sum, point) => sum + point.value, 0);
  const pct = Math.round((100 * d.spend.all) / d.spend.cap);
  const attention = [
    [
      d.openReviews.count,
      "open mark reviews",
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
      `spend at ${pct}% of the cap`,
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active students, 7 days"
          value={d.active.now}
          delta={d.active.now - d.active.prev}
          description={`vs ${d.active.prev} previous 7`}
          icon={<PortalIcon name="user" />}
        />
        <StatCard
          title="Sessions, last 7 days"
          value={sessionTotal}
          description="Finished sessions · last 7 Sydney days"
          values={sessions.map((point) => point.value)}
          icon={<PortalIcon name="chart-line" />}
        />
        <StatCard
          title="Open reviews"
          value={d.openReviews.count}
          description={
            d.openReviews.oldestDays == null
              ? "Nothing waiting"
              : `oldest ${plural(d.openReviews.oldestDays, "day")}`
          }
          icon={<PortalIcon name="pen-line" />}
        />
        <Card data-component="StatCard" className="h-full gap-3">
          <CardHeader>
            <p className="text-muted-foreground text-xs">Spend this month</p>
          </CardHeader>
          <CardContent>
            <p className="num-display text-[30px] leading-none font-bold">
              {usd(d.spend.month)} of ${d.spend.cap}
            </p>
            <div
              role="progressbar"
              aria-label="All-time spend against cap"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, pct)}
              aria-valuetext={`${usd(d.spend.all)} of $${d.spend.cap} (${pct}%)`}
              className="mt-3"
            >
              <span aria-hidden="true">
                <Meter
                  value={pct}
                  tone="brand"
                  label="All-time spend against cap"
                />
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Month to date · meter shows all-time cap usage
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-brand/30">
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Needs attention
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <ul className="divide-y divide-dashed">
              {rows.map(([n, text, href]) => (
                <li key={href + text}>
                  <Link
                    href={href}
                    className="hover:bg-surface -mx-2 flex items-center gap-3 rounded-lg px-3 py-4 text-sm"
                  >
                    <Badge variant="warning">
                      <Alert className="size-3" />
                      {n}
                    </Badge>
                    <span>{text}</span>
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
      <div className="grid gap-4 xl:grid-cols-2">
        <DailyChart
          title="Sessions per day"
          hero={plural(sessionTotal, "session")}
          points={sessions}
          kind="area"
        />
        <DailyChart
          title="AI spend, last 7 days"
          hero={usd(spendTotal)}
          points={spend}
          kind="bars"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle role="heading" aria-level={2}>
              Recent sessions
            </CardTitle>
            <Link
              href="/admin/students"
              className="text-sm font-semibold underline underline-offset-4"
            >
              Student activity
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
        <Card className="min-w-0">
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle role="heading" aria-level={2}>
              Review queue
            </CardTitle>
            <Link
              href="/admin/marking/review"
              className="text-sm font-semibold underline underline-offset-4"
            >
              View queue
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="bg-brand-soft text-brand-text grid size-12 place-items-center rounded-xl">
                <PortalIcon name="pen-line" />
              </span>
              <div>
                <p className="num-display text-[30px] leading-none font-bold">
                  {d.openReviews.count}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Open mark reviews
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              {d.openReviews.oldestDays == null
                ? "Nothing waiting for a second look."
                : `Oldest review has been waiting ${plural(d.openReviews.oldestDays, "day")}.`}
            </p>
            <Link
              href="/admin/marking/review?tab=failed"
              className="hover:bg-accent flex items-center justify-between gap-3 rounded-xl border p-4 text-sm"
            >
              <span>Failed or unreadable · last 7 days</span>
              <Badge variant={d.attention.failed ? "warning" : "muted"}>
                {d.attention.failed}
              </Badge>
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export const metadata = pageMetadata("Dashboard");

export default function AdminHome() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Students, sessions, reviews and spend at a glance."
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
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </>
        }
      >
        <Dashboard />
      </Suspense>
    </div>
  );
}
