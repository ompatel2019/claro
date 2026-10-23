"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  SessionList,
  type SessionDetail,
} from "./student/activity/session-list";
import { SessionGlyph } from "./student/activity/session-icon";
import { ActivityFilterControls } from "./student/activity/filter-controls";
import { EmptyState } from "./empty-state";
import { History, SearchOff, Close } from "./icons";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent } from "./ui/popover";
import { Button, buttonVariants } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  activityHref,
  type ActivityFilters,
  type ActivityData,
} from "@/lib/activity-filters";
import { kindLabels, isStudentSession } from "@/lib/session-summary";
import { dateLabel, plural, type Topic } from "@/lib/practice";
import { cn } from "@/lib/utils";

const subscribeOnline = (change: () => void) => {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
};
const onlineSnapshot = () => navigator.onLine;
const serverOnline = () => true;
export function ActivityBrowser({
  filters: f,
  data: suppliedData,
  topics,
  today,
  details,
}: {
  filters: ActivityFilters;
  data: ActivityData;
  topics: Topic[];
  today: string;
  details?: Record<string, SessionDetail>;
}) {
  const [loaded, setLoaded] = useState({
    page: suppliedData.page,
    rows: suppliedData.rows,
    details: details ?? {},
  });
  const [visible, setVisible] = useState(12);
  if (loaded.page !== suppliedData.page) {
    const rows =
      suppliedData.page > loaded.page
        ? [...loaded.rows, ...suppliedData.rows]
        : suppliedData.rows;
    setLoaded({
      page: suppliedData.page,
      rows: [...new Map(rows.map((r) => [r.id, r])).values()],
      details: { ...loaded.details, ...details },
    });
    setVisible((n) => n + 12);
  }
  const data = { ...suppliedData, rows: loaded.rows.filter(isStudentSession) };
  const router = useRouter();
  const online = useSyncExternalStore(
    subscribeOnline,
    onlineSnapshot,
    serverOnline,
  );
  const [from, setFrom] = useState(f.from || today);
  const [to, setTo] = useState(f.to || today);
  const [endpoint, setEndpoint] = useState("from");
  const go = (changes: Record<string, string | number | undefined>) =>
    router.push(activityHref(f, { page: 1, ...changes }));
  const values = {
    status: f.status,
    topic: f.topic,
    q: f.q,
    sort: f.sort === "newest" ? "" : f.sort,
    range: f.range,
  };
  const hidden = {
    kind: f.kind,
    ...(f.date
      ? { date: f.date }
      : f.range === "custom"
        ? { from: f.from, to: f.to }
        : {}),
  };
  return (
    <div className="min-w-0">
      {!online && (
        <p role="status" className="bg-muted mb-3 rounded-lg px-3 py-2 text-sm">
          You&apos;re offline. We&apos;ll save when you&apos;re back.
        </p>
      )}
      <ActivityFilterControls
        activeCount={
          [
            f.kind,
            f.status,
            f.topic,
            f.q,
            f.date || f.range,
            f.sort !== "newest" ? f.sort : "",
          ].filter(Boolean).length
        }
        values={values}
        hidden={hidden}
        clearHref="/student/activity"
        filters={[
          {
            name: "status",
            label: "Status",
            all: "Any status",
            options: [
              { value: "progress", label: "In progress" },
              { value: "marking", label: "Marking" },
              { value: "finished", label: "Finished" },
              { value: "provisional", label: "Has provisional marks" },
            ],
          },
          {
            name: "topic",
            label: "Topic",
            all: "All topics",
            options: topics
              .filter((t) => !t.parent_id)
              .flatMap((t) => [
                { value: t.id, label: t.name },
                ...topics
                  .filter((s) => s.parent_id === t.id)
                  .map((s) => ({
                    value: s.id,
                    label: `${t.name} · ${s.name}`,
                  })),
              ]),
          },
          {
            name: "range",
            label: "Date",
            all: "All time",
            clearOnChange: ["date", "from", "to"],
            options: [
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "custom", label: "Custom range" },
            ],
          },
          {
            name: "q",
            label: "Search",
            placeholder: "Search sessions",
          },
          {
            name: "sort",
            label: "Sort",
            all: "Newest first",
            options: [
              { value: "oldest", label: "Oldest" },
              { value: "highest", label: "Highest score" },
              { value: "lowest", label: "Lowest score" },
            ],
          },
        ]}
      >
        <ToggleGroup
          aria-label="Session kind"
          value={[f.kind || "all"]}
          onValueChange={(v) => go({ kind: v[0] === "all" ? "" : v[0] || "" })}
          className="ac-chips"
        >
          <ToggleGroupItem value="all">
            All <span className="ac-n">{data.kind_total}</span>
          </ToggleGroupItem>
          {Object.entries(kindLabels).map(([kind, label]) => (
            <ToggleGroupItem key={kind} value={kind}>
              <SessionGlyph kind={kind} aria-hidden strokeWidth={1.5} />
              {label} <span className="ac-n">{data.kinds[kind] || 0}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ActivityFilterControls>
      {f.date && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{dateLabel(f.date, true)}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go({ date: "" })}
            aria-label="Remove day filter"
          >
            <Close className="size-3" />
            Remove day
          </Button>
        </div>
      )}
      {f.range === "custom" && (
        <div className="mb-3">
          <Popover>
            <PopoverPrimitive.Trigger
              render={
                <Button
                  variant="outline"
                  className="h-auto min-h-9 whitespace-normal"
                />
              }
            >
              Choose dates
              {f.from && f.to
                ? ` · ${dateLabel(f.from, true)} to ${dateLabel(f.to, true)}`
                : ""}
            </PopoverPrimitive.Trigger>
            <PopoverContent align="start" className="max-w-[calc(100vw-2rem)]">
              <ToggleGroup
                aria-label="Date range endpoint"
                value={[endpoint]}
                onValueChange={(v) => setEndpoint(v[0] || "from")}
                variant="outline"
              >
                <ToggleGroupItem value="from">From</ToggleGroupItem>
                <ToggleGroupItem value="to">To</ToggleGroupItem>
              </ToggleGroup>
              <Calendar
                key={endpoint}
                label={endpoint === "from" ? "Start date" : "End date"}
                today={today}
                value={endpoint === "from" ? from : to}
                onChange={(d) => (endpoint === "from" ? setFrom(d) : setTo(d))}
              />
              <p className="text-muted-foreground text-xs">
                {dateLabel(from, true)} to {dateLabel(to, true)}
              </p>
              <Button
                onClick={() =>
                  go({
                    from: from < to ? from : to,
                    to: to > from ? to : from,
                    date: "",
                    range: "custom",
                  })
                }
              >
                Apply dates
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      )}
      <p className="ac-sum" aria-live="polite">
        {plural(data.total, "session")}
        {data.stats.questions > 0 &&
          ` · ${plural(data.stats.questions, "question")} answered`}
        {data.stats.average != null &&
          ` · average ${Math.round(data.stats.average)}%`}
      </p>
      <div className="ac-card">
        {!data.rows.length ? (
          <EmptyState
            icon={data.all_total ? SearchOff : History}
            title={data.all_total ? "No sessions match" : "Nothing here yet"}
            description={
              data.all_total
                ? "Try a different filter to find your session."
                : "Your sprints, flashcards and checks will appear here."
            }
            action={
              <Link
                href={data.all_total ? "/student/activity" : "/student/sprint"}
                className={buttonVariants()}
              >
                {data.all_total ? "Clear filters" : "Start sprint"}
              </Link>
            }
          />
        ) : (
          <>
            <SessionList
              rows={data.rows.slice(0, visible)}
              topics={topics}
              details={loaded.details}
              today={today}
              sort={f.sort}
            />
            <nav
              aria-label="Activity pagination"
              className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3 text-[13px]"
            >
              <p className="text-muted-foreground" aria-live="polite">
                Showing {Math.min(visible, data.rows.length)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                {visible < data.rows.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisible((n) => n + 12)}
                  >
                    Load more
                  </Button>
                )}
                {visible >= data.rows.length && data.page * 20 < data.total && (
                  <Link
                    href={activityHref(f, { page: data.page + 1 })}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                  >
                    Load more
                  </Link>
                )}
              </div>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
