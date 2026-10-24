import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { EmptyState, Meter, PageHeader } from "@/components/claro";
import { StatCard } from "@/components/claro/data-display";
import { DailyChart } from "@/components/daily-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadSpend } from "@/lib/admin-data";
import { dateLabel } from "@/lib/practice";
import { singleParams, sydneyDay } from "@/lib/admin";
import { parseRange } from "./data";
import { RangeSelect } from "./range-select";
import { ModelTable, TaskTable, StudentTable } from "./tables";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usd, avgUsd } from "./helpers";
import { hairlineRows } from "@/lib/table-style";

export const metadata = pageMetadata("AI spend");

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = new Date();
  const range = parseRange(params, now);
  const rejectedDates =
    range === "month" &&
    (singleParams(params).range === "custom" ||
      params.from !== undefined ||
      params.to !== undefined);
  const spend = await loadSpend(range);
  const pct = Math.min(100, (spend.all / spend.cap) * 100);
  const callsLabel = (n: number) =>
    `${n.toLocaleString("en-AU")} ${n === 1 ? "call" : "calls"}`;
  const empty = [
    !spend.byModel.length && "model",
    !spend.byTask.some((g) => g.tasks.length) && "task",
    !spend.topStudents.length && "student",
  ].filter((v): v is string => !!v);
  const total = spend.perDay.reduce((sum, point) => sum + point.usd, 0);
  const throughNow = spend.window.to === sydneyDay(spend.window.until);
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="AI spend"
        description="AI usage and costs in USD."
        actions={
          <RangeSelect
            key={JSON.stringify([range, params])}
            range={range}
            today={sydneyDay(now)}
          />
        }
      />
      <p
        className="text-muted-foreground text-[13px]"
        data-range={typeof range === "object" ? "custom" : range}
      >
        {spend.window.from
          ? `${dateLabel(spend.window.from)} to ${dateLabel(spend.window.to)}`
          : "All time"}{" "}
        (Sydney{throughNow ? ", through now" : ", inclusive"}) ·{" "}
        {spend.calls.toLocaleString("en-AU")} OpenRouter calls
        {rejectedDates && (
          <span> · Those dates aren&apos;t valid, showing this month</span>
        )}
      </p>
      <div className="grid min-w-0 gap-3 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Today"
          value={usd(spend.today)}
          description={`${callsLabel(spend.todayCalls)} · Sydney day`}
        />
        <StatCard
          title="This month"
          value={usd(spend.month)}
          description={`${callsLabel(spend.monthCalls)} · Sydney calendar month`}
        />
        <StatCard
          title="All time"
          value={`${usd(spend.all)} of $${spend.cap.toFixed(0)}`}
          description={
            <div className="mt-2 w-full space-y-2">
              <div
                role="progressbar"
                aria-label="Spend against cap"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={`${usd(spend.all)} of ${usd(spend.cap)}`}
                className="relative"
              >
                <span aria-hidden="true">
                  <Meter value={pct} tone="brand" label="Spend against cap" />
                </span>
                {spend.markers.map((marker) => (
                  <span
                    key={marker}
                    aria-hidden="true"
                    className="bg-foreground absolute -top-0.5 h-2.5 w-px"
                    style={{
                      left: `${Math.min(100, (marker / spend.cap) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <ul className="space-y-1 tabular-nums">
                {spend.markers.map((marker, index) => (
                  <li key={marker}>
                    {Math.round((marker / spend.cap) * 100)}% ·{" "}
                    {["Evals blocked", "All AI stops", "Cap"][index]}
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>
            <h2>Cost per marked answer</h2>
          </CardTitle>
          <CardDescription>
            Marking, checks and transcription, by the question&apos;s marks.
            Selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Cost per marked answer" className={hairlineRows}>
            <TableHeader>
              <TableRow>
                <TableHead>Question marks</TableHead>
                <TableHead className="text-right">Answers marked</TableHead>
                <TableHead className="text-right">Tracked</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Average cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spend.byMarkValue.map((bucket) => (
                <TableRow key={bucket.label}>
                  <TableCell>{bucket.label}</TableCell>
                  <TableCell className="text-right">{bucket.answers}</TableCell>
                  <TableCell className="text-right">
                    {bucket.trackedAnswers}
                  </TableCell>
                  <TableCell className="text-right">
                    {usd(bucket.usd)}
                  </TableCell>
                  <TableCell className="text-right">
                    {bucket.average === null ? "—" : avgUsd(bucket.average)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-3 text-[13px]">
            Older and batch calls without a linked answer aren&apos;t counted
            here: {usd(spend.unattributedWrittenUsd)}.
          </p>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {total > 0 ? (
          <DailyChart
            title="Spend per day"
            description="OpenRouter only"
            hero={usd(total)}
            kind="bars"
            points={spend.perDay.map((p) => ({
              day: p.day,
              value: p.usd,
              models: p.models,
            }))}
          />
        ) : (
          <EmptyState
            title="No spend in this range"
            description={`Daily spend${empty.length ? ` and the ${empty.join(", ")} breakdowns` : ""} appear${empty.length ? "" : "s"} after an AI call.`}
          />
        )}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Rate limits</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <dt className="text-muted-foreground">AI calls per student</dt>
                <dd className="tabular-nums">
                  {spend.limits.perMinute}/min and {spend.limits.perHour}/hour
                </dd>
                <dd className="text-muted-foreground mt-1 text-[13px]">
                  Admins exempt
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mark my answer</dt>
                <dd className="tabular-nums">
                  {spend.limits.markMyAnswerPerDay}/day per student (Sydney)
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Disputes</dt>
                <dd className="tabular-nums">
                  {spend.limits.openDisputesPerAnswer} open per answer,{" "}
                  {spend.limits.openDisputesPerStudent} open per student
                </dd>
              </div>
            </dl>
            <h3 className="text-sm font-semibold">
              Students over 150 calls in the last hour
            </h3>
            {spend.over150.length ? (
              <ul
                aria-label="Students over 150 calls"
                className="space-y-2 text-sm"
              >
                {spend.over150.map((student) => (
                  <li
                    key={student.id}
                    className="flex min-w-0 justify-between gap-3"
                  >
                    <Link
                      className="wrap-anywhere underline underline-offset-4"
                      href={`/admin/students/${encodeURIComponent(student.id)}`}
                    >
                      {student.name}
                    </Link>
                    <span className="shrink-0 tabular-nums">
                      {student.calls} calls
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No one right now</p>
            )}
          </CardContent>
        </Card>
      </div>
      {total <= 0 || !empty.length ? null : (
        <EmptyState
          title={`No ${empty.join(", ")} spend yet`}
          description="Breakdowns appear here after an AI call in this range. Students cover the last 30 days."
        />
      )}
      <ModelTable rows={spend.byModel} />
      <TaskTable groups={spend.byTask} />
      <StudentTable rows={spend.topStudents} />
    </div>
  );
}
