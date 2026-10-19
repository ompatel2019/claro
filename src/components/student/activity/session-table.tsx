"use client";

import { Fragment } from "react";
import Link from "next/link";
import { PortalIcon } from "@/components/icons";
import { SessionIcon } from "./session-icon";
import { Meter } from "@/components/claro/data-display";
import { StatusPill } from "@/components/status-pill";
import {
  sessionHref,
  sessionScore,
  sessionLabels,
} from "@/lib/session-summary";
import { dateLabel, type Topic } from "@/lib/practice";
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

function dayOf(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function bucket(value: string, today: string) {
  const day = dayOf(value);
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day >= addDays(today, -6) && day < today) return "Earlier this week";
  return "Earlier";
}

export function SessionTable({
  rows,
  today,
  sort,
  onDateSort,
  onOpen,
  topics = [],
  details = {},
}: {
  rows: ActivityRow[];
  topics?: Topic[];
  details?: Record<string, SessionDetail>;
  today: string;
  sort: string;
  onDateSort: () => void;
  onOpen: (row: ActivityRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        aria-label="Your activity"
        className="w-full table-fixed text-[13px]"
      >
        <thead className="text-muted-foreground text-left text-xs">
          <tr className="h-10 border-b">
            <th className="w-[65%] px-4 font-medium sm:w-[38%] lg:w-[32%]">
              Session
            </th>
            <th className="hidden w-[19%] px-3 font-medium lg:table-cell">
              Topic
            </th>
            <th className="px-3 font-medium sm:w-[24%] lg:w-[20%]">Result</th>
            <th className="hidden w-[7%] px-3 font-medium xl:table-cell">
              Time
            </th>
            <th
              className="hidden px-3 font-medium sm:table-cell"
              aria-sort={
                sort === "newest"
                  ? "descending"
                  : sort === "oldest"
                    ? "ascending"
                    : "none"
              }
            >
              <button
                type="button"
                onClick={onDateSort}
                aria-label="Date"
                className="rounded focus-visible:outline-2"
              >
                When
              </button>
            </th>
            <th className="hidden w-[9%] pr-4 text-right sm:table-cell">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const group =
              sort === "newest" ? bucket(row.started_at, today) : null;
            const href = sessionHref(row);
            const base = Object.values(sessionLabels).find(
              (label) =>
                row.title === label || row.title.startsWith(`${label} · `),
            );
            const detail = details[row.id];
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
            const topic = base
              ? row.title.slice(base.length).replace(/^ · /, "")
              : "";
            const scored =
              row.pct != null &&
              row.status !== "Marking" &&
              row.status !== "In progress" &&
              !row.study;
            return (
              <Fragment key={row.id}>
                {group &&
                  (index === 0 ||
                    group !== bucket(rows[index - 1].started_at, today)) && (
                    <tr>
                      <th
                        colSpan={6}
                        scope="rowgroup"
                        className="bg-muted/40 text-muted-foreground border-b px-4 py-1.5 text-left text-xs font-medium"
                      >
                        {group}
                      </th>
                    </tr>
                  )}
                <tr
                  className="hover:bg-accent h-[61px] cursor-pointer border-b last:border-b-0"
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest("a, button"))
                      onOpen(row);
                  }}
                >
                  <td className="px-4 py-3 max-sm:py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <SessionIcon kind={row.kind} />
                      <div className="min-w-0">
                        {href ? (
                          <Link
                            prefetch={false}
                            href={href}
                            aria-label={row.title}
                            title={row.title}
                            className="block truncate rounded text-sm font-medium hover:underline focus-visible:outline-2"
                          >
                            {title}
                          </Link>
                        ) : (
                          <span className="block truncate text-sm font-medium">
                            {title}
                          </span>
                        )}
                        <p className="text-muted-foreground truncate text-xs">
                          {topic || dateLabel(row.started_at, true)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td
                    className="text-muted-foreground hidden truncate px-3 lg:table-cell"
                    title={topic}
                  >
                    {unit?.name || topic || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {row.study && row.finished_at && reviews?.length ? (
                        <>
                          <Meter
                            value={(known / reviews.length) * 100}
                            label={`${row.title} cards known`}
                            className="hidden max-w-28 min-w-10 flex-1 sm:block"
                          />
                          <span className="font-semibold">
                            {known}/{reviews.length}{" "}
                            <span className="text-muted-foreground font-normal">
                              knew
                            </span>
                          </span>
                        </>
                      ) : scored ? (
                        <>
                          <Meter
                            value={row.pct!}
                            label={`${row.title} result`}
                            className="hidden max-w-24 min-w-10 flex-1 sm:block"
                          />
                          <span className="font-semibold tabular-nums">
                            {sessionScore(row.pct, row.status)}
                            {detail?.score != null &&
                              detail.max_score != null && (
                                <span className="text-muted-foreground ml-1 font-normal">
                                  {detail.score}/{detail.max_score}
                                </span>
                              )}
                          </span>
                        </>
                      ) : row.status === "Finished" ? (
                        <span
                          className="text-muted-foreground text-xs"
                          aria-label={
                            row.study ? "Study session, no score" : undefined
                          }
                        >
                          {sessionScore(row.pct, row.status, row.study)}
                        </span>
                      ) : null}
                      {row.status !== "Finished" && (
                        <span className="[&>span]:border-border">
                          <StatusPill
                            pill={
                              row.kind === "single" &&
                              !row.finished_at &&
                              row.answered === 0
                                ? "Draft"
                                : row.status
                            }
                          />
                        </span>
                      )}
                      {row.provisional && row.status !== "Provisional" && (
                        <StatusPill pill="Provisional" />
                      )}
                    </div>
                  </td>
                  <td className="text-muted-foreground hidden px-3 xl:table-cell">
                    {row.elapsed_s
                      ? `${Math.ceil(row.elapsed_s / 60)} min`
                      : "—"}
                  </td>
                  <td className="text-muted-foreground hidden px-3 sm:table-cell">
                    {dayOf(row.started_at) === today
                      ? new Date(row.started_at)
                          .toLocaleTimeString("en-AU", {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: "Australia/Sydney",
                          })
                          .replace(" ", "")
                      : dayOf(row.started_at) === addDays(today, -1)
                        ? `Yesterday, ${new Date(row.started_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }).replace(" ", "")}`
                        : dateLabel(row.started_at, true)}
                  </td>
                  <td className="hidden pr-4 sm:table-cell">
                    {!row.finished_at && href ? (
                      <Link
                        href={href}
                        className="rounded-full border px-3 py-1.5 text-xs"
                      >
                        Resume
                      </Link>
                    ) : (
                      <PortalIcon
                        name="chevron-right"
                        aria-hidden
                        className="text-muted-foreground size-4"
                      />
                    )}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
