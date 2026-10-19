"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, CheckCircle, Clock, ChevronDown, ChevronUp } from "./icons";
import { DataTable, type Column, type TableSorting } from "./data-table";
import { Meter } from "./claro/data-display";
import { buttonVariants } from "./ui/button";
import { dateLabel, scoreTone } from "@/lib/practice";
import {
  practiseHref,
  verbRows,
  type TopicProgress,
  type Breakdown,
} from "@/lib/progress";

/** Keep the compact topic and verb tables shareable without duplicating table sorting. */
function useTableSort(key: string, columns: string[]) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const [id, dir] = (params.get(key) ?? "").split(":");
  const sorting: TableSorting =
    columns.includes(id) && (dir === "asc" || dir === "desc")
      ? { id, dir }
      : null;
  return {
    sorting,
    onSortChange(next: TableSorting) {
      const query = new URLSearchParams(params.toString());
      if (next) query.set(key, `${next.id}:${next.dir}`);
      else query.delete(key);
      router.replace(`${pathname}${query.size ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
  };
}

export function ProgressScore({
  pct,
  bar = false,
}: {
  pct: number | null;
  bar?: boolean;
}) {
  if (pct === null)
    return <span className="text-muted-foreground text-xs">No marks yet</span>;
  const tone = scoreTone(pct);
  const Icon =
    tone === "success" ? CheckCircle : tone === "warning" ? Clock : Alert;
  const word =
    tone === "success"
      ? "Strong"
      : tone === "warning"
        ? "Building"
        : "Needs practice";
  return (
    <div className="flex items-center gap-3">
      {bar && (
        <Meter
          value={pct}
          label={`${Math.round(pct)}% average`}
          tone={pct < 50 ? "brand" : "default"}
          className="min-w-20 flex-1"
        />
      )}
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold tabular-nums">
        <Icon aria-hidden className="sr-only" />
        {Math.round(pct)}%<span className="sr-only"> · {word}</span>
      </span>
    </div>
  );
}

export function TopicProgressTable({ rows }: { rows: TopicProgress[] }) {
  const sort = useTableSort("topicsSort", [
    "name",
    "answered",
    "marks",
    "pct",
    "last",
  ]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const parents = rows.filter((r) => !r.parent_id);
  const columns: Column<TopicProgress>[] = [
    {
      id: "name",
      header: "Topic",
      sort: (r) => r.name,
      className:
        "w-full min-w-0 max-w-[10rem] wrap-anywhere whitespace-normal max-sm:px-2 max-sm:first:pl-2",
      cell: (r) => (
        <>
          {r.parent_id ? (
            <span className="block py-2 pl-2">{r.name}</span>
          ) : (
            <button
              className="flex w-full items-center gap-2 py-2 text-left font-semibold"
              aria-expanded={open.has(r.id)}
              aria-controls={open.has(r.id) ? `topic-${r.id}` : undefined}
              onClick={() =>
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(r.id)) next.delete(r.id);
                  else next.add(r.id);
                  return next;
                })
              }
            >
              {open.has(r.id) ? (
                <ChevronUp className="size-4 shrink-0" />
              ) : (
                <ChevronDown className="size-4 shrink-0" />
              )}
              {r.name}
            </button>
          )}
          <p className="sr-only">
            {r.answered} answered · {r.earned} / {r.possible} marks · Last
            practised{" "}
            {r.last_answered ? dateLabel(r.last_answered, true) : "Not started"}
          </p>
        </>
      ),
    },
    {
      id: "answered",
      header: "Answered",
      className: "whitespace-nowrap",
      sort: (r) => r.answered,

      cell: (r) => r.answered,
    },
    {
      id: "marks",
      header: "Marks",
      className: "whitespace-nowrap",
      sort: (r) => r.earned,

      cell: (r) => `${r.earned} / ${r.possible}`,
    },
    {
      id: "pct",
      header: "Average",
      className: "min-w-44",
      sort: (r) => r.pct,
      cell: (r) =>
        r.possible ? (
          <ProgressScore pct={r.pct} bar />
        ) : (
          <span className="text-muted-foreground text-xs whitespace-normal">
            Not started
          </span>
        ),
    },
    {
      id: "last",
      header: "Last practised",
      className: "whitespace-nowrap",
      sort: (r) => r.last_answered,

      cell: (r) =>
        r.last_answered ? dateLabel(r.last_answered, true) : "Not started",
    },
    {
      id: "action",
      header: "",
      className: "max-sm:px-2 max-sm:last:pr-2",
      cell: (r) => (
        <Link
          aria-label={`${r.answered ? "Practise" : "Start"} ${r.name}`}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "px-2",
          })}
          href={practiseHref(r)}
        >
          {r.answered ? "Practise" : "Start"}
        </Link>
      ),
    },
  ];
  return (
    <div className="overflow-x-auto [&_th]:normal-case [&_th_button]:normal-case [&_tr]:border-solid [&>div]:min-w-[720px]">
      <DataTable
        student
        {...sort}
        label="Marks by topic"
        columns={columns}
        rows={parents}
        // Nested table widths must not contribute to the parent's intrinsic width.
        renderDetail={(r) =>
          open.has(r.id) ? (
            <div
              id={`topic-${r.id}`}
              className="bg-surface p-2 [contain:inline-size] max-sm:px-1"
            >
              <DataTable
                student
                {...sort}
                label={`${r.name} subtopics`}
                columns={columns}
                rows={rows.filter((t) => t.parent_id === r.id)}
              />
            </div>
          ) : null
        }
      />
    </div>
  );
}

export function VerbProgressTable({ rows }: { rows: Breakdown[] }) {
  const shown = verbRows(rows);
  const sort = useTableSort("verbsSort", ["verb", "answered", "pct"]);
  return (
    <DataTable
      student
      {...sort}
      label="By directive verb"
      rows={shown}
      columns={[
        {
          id: "verb",
          header: "Verb",
          sort: (r) => r.id,
          className: "w-full whitespace-normal",
          cell: (r) => r.id,
        },
        {
          id: "answered",
          header: "Answered",
          sort: (r) => r.answered,

          cell: (r) => r.answered,
        },
        {
          id: "pct",
          header: "Avg %",
          sort: (r) => r.pct,
          cell: (r) => <ProgressScore pct={r.pct} bar />,
        },
        {
          id: "action",
          header: "",
          cell: (r) =>
            r.id === shown[0]?.id ? (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/student/sprint?type=short&verb=${encodeURIComponent(r.id)}`}
              >
                Practise
              </Link>
            ) : null,
        },
      ]}
    />
  );
}
