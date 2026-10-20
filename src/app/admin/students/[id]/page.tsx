import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Close, PortalIcon } from "@/components/icons";
import { loadStudentDetail, loadStudentFeedback } from "@/lib/admin-data";
import { pageOf, singleParams, sydneyDay, tableParams } from "@/lib/admin";
import { dateLabel, plural } from "@/lib/practice";
import {
  calendarDate,
  filterSessions,
  sessionItems,
  sessionStatus,
  sessionTitle,
} from "@/lib/students";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { FeedbackDetail } from "@/components/feedback-detail";
import { UrlSheet } from "@/components/url-sheet";
import { FilterBar } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { LinkTabs } from "@/components/link-tabs";
import { PageHeader } from "@/components/page-header";
import { SessionsTable, type SessionItem } from "@/components/sessions-table";
import { StatCard } from "@/components/claro/data-display";
import { StudentMenu } from "@/components/student-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

import { Report } from "./report";
import { UsageTab } from "./usage-tab";
import { TopicsTab, ReviewsTab, FeedbackTab } from "./detail-tables";

const TABS = {
  sessions: "Sessions",
  topics: "Topics",
  reviews: "Reviews & disputes",
  feedback: "Feedback",
  usage: "AI usage",
} as const;
const pct = (n: number | null) => (n == null ? null : Math.round(n));
const SESSION_KEYS: Record<string, (s: SessionItem) => string | number | null> =
  {
    kind: (s) => s.kind,
    title: (s) => s.title,
    score: (s) => (s.max && s.score != null ? (100 * s.score) / s.max : null),
    time: (s) => s.elapsed_s,
    items: (s) => Number.parseInt(s.items),
    date: (s) => s.started_at,
    status: (s) => s.status,
  };

export const metadata = pageMetadata("Student details");

export default async function StudentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const sp = singleParams(raw);
  const d = await loadStudentDetail(id);
  if (!d) notFound();
  const tab = (
    sp.tab && Object.hasOwn(TABS, sp.tab) ? sp.tab : "sessions"
  ) as keyof typeof TABS;
  const { profile } = d;
  const {
    week,
    averages: { avg30, prev30 },
  } = d;
  const last = d.lastActive;
  const base = `/admin/students/${id}`;
  const tabHref = (t: string) => `${base}?tab=${t}`;

  const selectedFeedback =
    tab === "feedback" && sp.feedback
      ? await loadStudentFeedback(sp.feedback, id)
      : null;
  if (sp.feedback && tab === "feedback" && !selectedFeedback) notFound();
  const date = calendarDate(sp.date);
  const sessions = filterSessions(
    d.sessions,
    { ...sp, date: date ?? undefined },
    sydneyDay,
    d.today,
  );
  const items: SessionItem[] = sessions
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      study: s.kind === "flashcards" && s.config.mode !== "test",
      title: sessionTitle(s, d.topics),
      score:
        !s.finished_at || sessionStatus(s) === "Marking" || s.score == null
          ? null
          : Number(s.score),
      max: s.max_score == null ? null : Number(s.max_score),
      items: sessionItems(s),
      elapsed_s: s.elapsed_s ?? 0,
      started_at: s.started_at,
      status: sessionStatus(s),
    }))
    .filter(
      (s) =>
        !sp.q ||
        `${s.id} ${s.kind} ${s.title} ${s.items} ${s.status} ${s.started_at} ${s.score ?? ""}`
          .toLowerCase()
          .includes(sp.q.trim().toLowerCase()),
    );
  const { sort, page } = tableParams(sp, { id: "date", dir: "desc" });
  const paged = pageOf(items, SESSION_KEYS, sort, page, {
    id: "date",
    dir: "desc",
  });
  const open = sp.session ? d.sessions.find((s) => s.id === sp.session) : null;
  if (sp.session && !open) notFound();
  return (
    <div className="space-y-6">
      <Link
        href="/admin/students"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <PortalIcon name="arrow-left" className="size-4" />
        Back to students
      </Link>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {profile.full_name || "Unnamed student"}
            {d.blocked && (
              <Badge variant="destructive">
                <Close aria-hidden className="size-3" />
                Blocked
              </Badge>
            )}
          </span>
        }
        description={[
          d.email || "No email",
          profile.year_level ? `Year ${profile.year_level}` : "Year not set",
          profile.school || "School not set",
          `Joined ${dateLabel(profile.created_at, true)}`,
          `Last active ${last ? dateLabel(last, true) : "never"}`,
        ].join(" · ")}
        actions={<StudentMenu userId={id} blocked={d.blocked} />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Questions this week"
          value={week.thisWeek}
          delta={week.thisWeek - week.lastWeek}
          description={`vs ${week.lastWeek} last week`}
        />
        <StatCard
          title="Average mark"
          value={avg30 == null ? "No marks yet" : `${pct(avg30)}%`}
          delta={
            avg30 == null || prev30 == null
              ? undefined
              : pct(avg30)! - pct(prev30)!
          }
          unit={avg30 == null || prev30 == null ? undefined : "pp"}
          description={
            avg30 == null || prev30 == null
              ? "Last 30 days"
              : "vs previous 30 days"
          }
        />
        <StatCard
          title="Streak"
          value={plural(d.activity.current_streak, "day")}
          description={`Longest ${plural(d.activity.longest_streak, "day")}`}
        />
        <StatCard
          title="Flashcards due"
          value={d.due.today}
          description={`${d.due.tomorrow} more tomorrow`}
        />
      </div>
      <ActivityHeatmap
        days={d.activity.days}
        today={d.today}
        current={d.activity.current_streak}
        longest={d.activity.longest_streak}
        link={`${base}?tab=sessions&date=`}
      />
      <LinkTabs
        label="Student tabs"
        active={tab}
        tabs={Object.entries(TABS).map(([value, label]) => ({
          value,
          label,
          href: tabHref(value),
        }))}
      />
      <FilterBar
        customSelect
        values={sp}
        hidden={{ tab, date: date ?? undefined }}
        primary={tab === "sessions" ? "kind" : undefined}
        filters={[
          {
            name: "q",
            label: "Search",
            placeholder: `Search ${TABS[tab].toLowerCase()}`,
          },
          ...(tab === "sessions"
            ? [
                {
                  name: "kind",
                  label: "Kind",
                  all: "All",
                  options: [
                    { value: "sprint", label: "Sprints" },
                    { value: "flashcards", label: "Flashcards" },
                    { value: "single", label: "Mark my answer" },
                  ],
                },
                {
                  name: "status",
                  label: "Status",
                  all: "Any",
                  options: [
                    "In progress",
                    "Marking",
                    "Finished",
                    "Provisional",
                  ].map((value) => ({
                    value,
                    label:
                      value === "Provisional" ? "Has provisional marks" : value,
                  })),
                },
                {
                  name: "topic",
                  label: "Topic",
                  all: "Any",
                  options: d.topics.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                },
                {
                  name: "range",
                  label: "Date",
                  all: "All time",
                  options: ["7", "30", "90"].map((value) => ({
                    value,
                    label: `Last ${value} days`,
                  })),
                },
                {
                  name: "from",
                  label: "From",
                  placeholder: "",
                  type: "date" as const,
                },
                {
                  name: "to",
                  label: "To",
                  placeholder: "",
                  type: "date" as const,
                },
              ]
            : []),
        ]}
      />
      {selectedFeedback && (
        <UrlSheet parameter="feedback" title="Feedback">
          <FeedbackDetail
            row={selectedFeedback.row}
            photos={selectedFeedback.photos}
          />
        </UrlSheet>
      )}
      {tab === "sessions" && (
        <>
          {date && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{dateLabel(date, true)}</Badge>
              <Link href={tabHref("sessions")} className="underline">
                Show all days
              </Link>
            </p>
          )}
          {items.length || open ? (
            <SessionsTable
              rows={paged.rows}
              pager={paged.pager}
              report={
                open
                  ? {
                      title: `${sessionTitle(open, d.topics)} · ${dateLabel(open.started_at, true)}`,
                      body: (
                        <Report
                          sessionId={open.id}
                          userId={id}
                          session={open}
                        />
                      ),
                    }
                  : null
              }
            />
          ) : (
            <EmptyState
              icon={History}
              title={
                date
                  ? "No sessions that day"
                  : d.sessions.length
                    ? "No sessions match"
                    : "No sessions yet"
              }
              description={
                date
                  ? "Pick another day on the heatmap."
                  : d.sessions.length
                    ? "Clear filters to see all sessions."
                    : "This student hasn’t started a session."
              }
            />
          )}
        </>
      )}
      {tab === "topics" && <TopicsTab d={d} sp={sp} />}
      {tab === "reviews" && <ReviewsTab d={d} sp={sp} base={base} />}
      {tab === "feedback" && <FeedbackTab d={d} sp={sp} />}
      {tab === "usage" && (
        <UsageTab
          usage={d.usage}
          lastHour={d.callsLastHour}
          spend={d.spend30}
          params={sp}
        />
      )}
    </div>
  );
}
