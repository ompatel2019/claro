import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/claro";
import { StatCard } from "@/components/claro/data-display";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { dateLabel } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { loadAccuracy, parseRange, percentLabel } from "./data";
import { loadEvalRuns, loadLatestEval } from "./eval";
import { RangeSelect } from "./range-select";
import { CategoryBar, WeeklyChart } from "./charts";
import { BreakdownTable, DisagreedQuestions } from "./tables";
import { HelpNote } from "./help-note";
import { QualityTabs, qualityHref, type QualityTab } from "./tabs";
import { mergeRuns } from "../engine/summary";
import { loadDocs } from "../engine/docs";
import { docTitle, orderDocs } from "../engine/doc-titles";
import { Markdown } from "../engine/markdown";
import { RunsTable } from "../engine/runs-table";
import { loadBucketRuns } from "../engine/store";
import { NewRun } from "../engine/new-run";
import { loadComparison } from "../engine/compare-data";
import { CompareView } from "../engine/compare-view";
import { BacklogSummary } from "../engine/backlog-summary";
import { evalRunDialogData } from "../engine/actions";

// Eval run actions (start, step, cancel) are invoked from this page.
export const maxDuration = 300;

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function commitLabel(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(date));
}

export default async function MarkingQualityPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const raw = one(params.tab);
  // Old Engine tab names and stray values land on a real tab.
  if (raw !== undefined && !["live", "runs", "docs"].includes(raw))
    redirect(qualityHref("live"));
  const tab: QualityTab = raw === "runs" || raw === "docs" ? raw : "live";
  const view =
    tab === "runs"
      ? await runsView(params)
      : tab === "docs"
        ? await docsView(params)
        : await liveView(params);
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Marking quality"
        description="How well the marker agrees with its checks, staff reviews and tutor marks."
        actions={view.actions}
      />
      <QualityTabs tab={tab} />
      {view.content}
    </div>
  );
}

async function liveView(params: Params) {
  const range = parseRange(params.range);
  const [data, evaluation] = await Promise.all([
    loadAccuracy(range),
    loadLatestEval(),
  ]);
  const runsLink = (
    <Link
      href={qualityHref("runs")}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      Open eval runs
    </Link>
  );
  const content = (
    <div className="min-w-0 space-y-4">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-[13px]">
        <span>
          {dateLabel(data.window.from)} to {dateLabel(data.window.today)}{" "}
          (Sydney, through now) · {data.written} marked written answers ·{" "}
          {data.checked} checked
        </span>
        <HelpNote label="How disputes are counted">
          Dispute counts, override rate and mean mark changes exclude disputes
          from blocked students and repeat disputers (at least 3 resolved
          disputes, with half unchanged or lowered). {data.excludedDisputes}{" "}
          disputes excluded.
        </HelpNote>
      </div>
      <div className="grid min-w-0 auto-rows-fr gap-3 sm:grid-cols-2">
        <StatCard
          title="Override rate"
          empty={!data.comparable}
          value={percentLabel(
            data.overrides,
            data.comparable,
            "No comparable reviews yet",
          )}
          description={
            <>
              {data.overrides} of {data.comparable} comparable resolved reviews
              <br />
              {data.meanDelta == null
                ? "No comparable marks yet"
                : `Mean |Δ| ${data.meanDelta.toFixed(2)} marks · ${data.comparable} comparable reviews`}
            </>
          }
        />
        <StatCard
          title="Admin-verified accuracy"
          empty={!data.verified}
          value={percentLabel(
            data.verifiedAgreed,
            data.verified,
            "No admin-verified answers yet",
          )}
          description={
            <>
              {data.verifiedAgreed} of {data.verified} comparable
              staff-initiated written reviews matched the AI mark exactly.
              <br />
              Resolved by an admin in this range. Student disputes are excluded;
              this review sample is not overall accuracy.
            </>
          }
        />
      </div>
      <CategoryBar mix={data.mix} />
      <div className="card-row grid min-w-0 gap-4 lg:grid-cols-2">
        <WeeklyChart weeks={data.weeks} kind="agreement" />
        <WeeklyChart weeks={data.weeks} kind="disputes" />
      </div>
      <div className="card-row grid min-w-0 gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="By type and marks"
          heading="Type / max marks"
          rows={data.byType}
        />
        <BreakdownTable
          title="By topic"
          heading="Parent topic"
          rows={data.byTopic}
        />
      </div>
      <DisagreedQuestions rows={data.questions} />
      {evaluation ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Latest offline eval</h2>
            </CardTitle>
            <CardDescription>
              Latest full run with held-out test answers; independent of the
              selected range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-[13px]">
                  Run date (Sydney)
                </dt>
                <dd>
                  {dateLabel(evaluation.stamp.slice(0, 10))},{" "}
                  {evaluation.stamp.slice(11, 13)}:
                  {evaluation.stamp.slice(13, 15)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-[13px]">
                  Marker model
                </dt>
                <dd className="break-all">{evaluation.model}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[13px]">
                  Agreement (same band, ±1 on 6+)
                </dt>
                <dd className="tabular-nums">
                  {(evaluation.agreement! * 100).toFixed(1)}%
                  <span className="text-muted-foreground mt-1 block text-[13px]">
                    Same band; within ±1 mark on 6+
                  </span>
                  <span className="text-muted-foreground mt-1 block text-[13px]">
                    Exact mark: {(evaluation.exact! * 100).toFixed(1)}% ·{" "}
                    {evaluation.n} test answers
                  </span>
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-xs wrap-anywhere">
              {evaluation.label}
            </p>
            {runsLink}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          title="No full offline eval yet"
          description="A full run with held-out test answers will appear here."
          action={runsLink}
        />
      )}
    </div>
  );
  return { content, actions: <RangeSelect range={range} /> };
}

async function runsView(params: Params) {
  const a = one(params.a),
    b = one(params.b);
  if (a !== undefined || b !== undefined) {
    const data = await loadComparison(a, b);
    return {
      actions: undefined,
      content: data ? (
        <CompareView data={data} />
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <p role="alert">Choose two different known runs to compare.</p>
            <Link
              href={qualityHref("runs")}
              className={buttonVariants({ variant: "outline" })}
            >
              Back to runs
            </Link>
          </CardContent>
        </Card>
      ),
    };
  }
  const [dialog, runs, web] = await Promise.all([
    evalRunDialogData(),
    loadEvalRuns(),
    loadBucketRuns(),
  ]);
  const rows = mergeRuns(runs, web);
  return {
    actions: dialog ? <NewRun data={dialog} /> : undefined,
    content: (
      <div className="min-w-0 space-y-4">
        <BacklogSummary runs={[...runs, ...web]} />
        {rows.length ? (
          <RunsTable rows={rows} />
        ) : (
          <EmptyState
            title="No eval runs yet"
            description="Bundled offline evaluation runs will appear here."
          />
        )}
      </div>
    ),
  };
}

async function docsView(params: Params) {
  const docs = orderDocs(await loadDocs());
  const requested = one(params.doc);
  const selected = docs.find((doc) => doc.id === requested) ?? docs[0];
  if (!selected)
    return {
      actions: undefined,
      content: (
        <EmptyState
          title="No engine docs yet"
          description="Marking engine documentation will appear here when available."
        />
      ),
    };
  return {
    actions: undefined,
    content: (
      <div className="grid min-w-0 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <Card className="min-w-0 self-start py-2">
          <nav
            aria-label="Engine documents"
            className="flex min-w-0 gap-1 overflow-x-auto px-2 md:flex-col"
          >
            {docs.map((doc) => (
              <Link
                key={doc.id}
                href={qualityHref("docs", { doc: doc.id })}
                aria-current={doc.id === selected.id ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-2 text-sm transition-colors",
                  doc.id === selected.id
                    ? "bg-brand-soft text-brand-text font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {docTitle(doc)}
                {doc.committedAt && (
                  <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                    Last commit {commitLabel(doc.committedAt)}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>{docTitle(selected)}</h2>
            </CardTitle>
            {selected.committedAt && (
              <CardDescription>
                Last commit {commitLabel(selected.committedAt)} (Sydney)
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="min-w-0">
            <Markdown text={selected.text} />
          </CardContent>
        </Card>
      </div>
    ),
  };
}
