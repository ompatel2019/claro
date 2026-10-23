import Link from "next/link";
import { PortalIcon } from "@/components/icons";
import { SessionIcon } from "./session-icon";
import { StatusPill } from "@/components/status-pill";
import {
  sessionHref,
  sessionScore,
  sessionLabels,
} from "@/lib/session-summary";
import { plural, type Topic } from "@/lib/practice";
import { addDays } from "@/lib/activity";
import type { ActivityRow } from "@/lib/activity-filters";

export type SessionDetail = {
  config: {
    topics?: string[];
    subtopics?: string[];
    question?: { topic_id?: string };
  };
  flashcard_reviews?: {
    flashcard_id: string;
    mark: number;
    created_at?: string;
  }[];
  score?: number | null;
  max_score?: number | null;
};

const kindNames = {
  sprint: "Topic Sprint",
  flashcards: "Flashcards",
  single: "Mark my answer",
};
const sydney = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    ...options,
  });
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const weekday = sydney({ weekday: "short", day: "numeric", month: "short" });
const clock = sydney({ hour: "numeric", minute: "2-digit" });

const dayOf = (value: string) => dayFormat.format(new Date(value));
const dateOf = (value: string) =>
  weekday.format(new Date(value)).replace(",", "");
const timeOf = (value: string) =>
  clock.format(new Date(value)).replace(" ", "").toLowerCase();
const minutes = (seconds: number) => `${Math.ceil(seconds / 60)} min`;
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function dayLabel(value: string, today: string) {
  const day = dayOf(value);
  const date = dateOf(value);
  if (day === today) return `Today · ${date}`;
  if (day === addDays(today, -1)) return `Yesterday · ${date}`;
  return date;
}

/** Sessions grouped by day when listed by date, each row opening its report. */
export function SessionList({
  rows,
  today,
  sort,
  topics = [],
  details = {},
}: {
  rows: ActivityRow[];
  topics?: Topic[];
  details?: Record<string, SessionDetail>;
  today: string;
  sort: string;
}) {
  const byDate = sort === "newest" || sort === "oldest";
  const groups: { key: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const key = byDate ? dayOf(row.started_at) : "";
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return (
    <section aria-label="Your activity">
      {groups.map((group) => {
        const total = group.rows.reduce((n, r) => n + r.elapsed_s, 0);
        return (
          <div key={group.key || "all"} className="ac-group">
            {byDate && (
              <h3 className="ac-day">
                <span>{dayLabel(group.rows[0].started_at, today)}</span>
                {total > 0 && <span>{minutes(total)}</span>}
              </h3>
            )}
            <ul>
              {group.rows.map((row) => (
                <SessionRow
                  key={row.id}
                  row={row}
                  topics={topics}
                  detail={details[row.id]}
                  showDay={!byDate}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function SessionRow({
  row,
  topics,
  detail,
  showDay,
}: {
  row: ActivityRow;
  topics: Topic[];
  detail?: SessionDetail;
  showDay: boolean;
}) {
  const href = sessionHref(row);
  const base = Object.values(sessionLabels).find(
    (label) => row.title === label || row.title.startsWith(`${label} · `),
  );
  const reviews = detail?.flashcard_reviews
    ? [
        ...new Map(
          [...detail.flashcard_reviews]
            .sort((a, b) =>
              (a.created_at ?? "").localeCompare(b.created_at ?? ""),
            )
            .map((r) => [r.flashcard_id, r]),
        ).values(),
      ]
    : undefined;
  const known = reviews?.filter((r) => r.mark === 1).length ?? 0;
  const selected = detail?.config.subtopics?.length
    ? detail.config.subtopics
    : (detail?.config.topics ??
      (detail?.config.question?.topic_id
        ? [detail.config.question.topic_id]
        : []));
  const selectedTopic = topics.find((t) => selected.includes(t.id));
  const unit = selectedTopic?.parent_id
    ? topics.find((t) => t.id === selectedTopic.parent_id)
    : selectedTopic;
  const title = base ?? row.title;
  const topic = base ? row.title.slice(base.length).replace(/^ · /, "") : "";
  const scored =
    row.pct != null &&
    row.status !== "Marking" &&
    row.status !== "In progress" &&
    !row.study;
  const marks =
    scored && detail?.score != null && detail.max_score != null
      ? { score: detail.score, max: detail.max_score }
      : null;
  const unfinished = !row.finished_at;
  return (
    <li className={unfinished ? "ac-row live" : "ac-row"}>
      <SessionIcon kind={row.kind} />
      <div className="min-w-0">
        <p className="ac-title" title={row.title}>
          {title}
        </p>
        <p className="ac-meta">
          <span>{kindNames[row.kind as keyof typeof kindNames]}</span>
          <span>
            {showDay && `${dateOf(row.started_at)}, `}
            {timeOf(row.started_at)}
          </span>
          {row.elapsed_s > 0 && (
            <span className="ac-dur">
              <PortalIcon name="clock" size={14} strokeWidth={1.5} />
              <span className="sr-only">Time</span>
              {duration(row.elapsed_s)}
            </span>
          )}
          {row.items > 0 && (
            <span>
              {plural(
                row.items,
                row.kind === "flashcards" ? "card" : "question",
              )}
            </span>
          )}
          {(unit?.name || topic) && <span>{unit?.name || topic}</span>}
        </p>
      </div>
      <div className="ac-res">
        {row.study && row.finished_at && reviews?.length ? (
          <>
            <b>
              {known}
              <small>/{reviews.length}</small>
            </b>
            <span>knew it</span>
          </>
        ) : scored ? (
          marks ? (
            <>
              <b>
                {marks.score}
                <small>/{marks.max}</small>
              </b>
              <span>{sessionScore(row.pct, row.status)}</span>
            </>
          ) : (
            <b>{sessionScore(row.pct, row.status)}</b>
          )
        ) : row.status === "Finished" ? (
          <span aria-label={row.study ? "Study session, no score" : undefined}>
            {sessionScore(row.pct, row.status, row.study)}
          </span>
        ) : null}
        {row.status !== "Finished" && (
          <StatusPill
            pill={
              row.kind === "single" && unfinished && row.answered === 0
                ? "Draft"
                : row.status
            }
          />
        )}
        {row.provisional && row.status !== "Provisional" && (
          <StatusPill pill="Provisional" />
        )}
      </div>
      {unfinished && href ? (
        <Link href={href} className="ac-resume">
          Resume
        </Link>
      ) : (
        <PortalIcon
          name="chevron-right"
          size={18}
          strokeWidth={1.5}
          className="ac-go"
        />
      )}
      {href && (
        <Link
          prefetch={false}
          href={href}
          aria-label={row.title}
          className="ac-cover"
        />
      )}
    </li>
  );
}
