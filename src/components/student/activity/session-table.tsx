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
import { dateLabel } from "@/lib/practice";
import { addDays } from "@/lib/activity";
import type { ActivityRow } from "@/lib/activity-filters";

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
}: {
  rows: ActivityRow[];
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
            <th className="w-[62%] px-4 font-medium sm:w-[38%] lg:w-[32%]">
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
            <th className="hidden w-8 pr-4 sm:table-cell">
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
            const title = base ?? row.title;
            const topic = base
              ? row.title.slice(base.length).replace(/^ · /, "")
              : "";
            const scored =
              row.pct != null && row.status !== "Marking" && !row.study;
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
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <SessionIcon kind={row.kind} />
                      <div className="min-w-0">
                        {href ? (
                          <Link
                            prefetch={false}
                            href={href}
                            aria-label={row.title}
                            title={row.title}
                            className="block truncate rounded font-medium hover:underline focus-visible:outline-2"
                          >
                            {title}
                          </Link>
                        ) : (
                          <span className="block truncate font-medium">
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
                    {topic || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {scored ? (
                        <>
                          <Meter
                            value={row.pct!}
                            label={`${row.title} result`}
                            className="hidden max-w-24 min-w-10 flex-1 sm:block"
                          />
                          <span className="font-semibold tabular-nums">
                            {sessionScore(row.pct, row.status)}
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
                        <StatusPill pill={row.status} />
                      )}
                      {row.provisional && row.status === "Marking" && (
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
                    {dateLabel(row.started_at, true)}
                  </td>
                  <td className="hidden pr-4 sm:table-cell">
                    <PortalIcon
                      name="chevron-right"
                      aria-hidden
                      className="text-muted-foreground size-4"
                    />
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
