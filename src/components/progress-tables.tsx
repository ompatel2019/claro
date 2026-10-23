"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PortalIcon } from "./icons";
import { type TableSorting } from "./data-table";
import { Meter } from "./claro/data-display";
import { buttonVariants } from "./ui/button";
import { dateLabel } from "@/lib/practice";
import { practiseHref, type TopicProgress } from "@/lib/progress";

/** Keep topic table sorting shareable through URL parameters. */
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

export function TopicProgressTable({ rows }: { rows: TopicProgress[] }) {
  const parents = rows
    .filter((r) => !r.parent_id)
    .sort((a, b) => a.sort - b.sort);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(parents.length === 4 ? [parents.at(-1)!.id] : []),
  );
  const sort = useTableSort("topicsSort", [
    "name",
    "answered",
    "marks",
    "pct",
    "last",
  ]);
  const focus = [...parents]
    .filter((r) => r.pct != null && r.answered > 0)
    .sort((a, b) => a.pct! - b.pct!)[0]?.id;
  const ordered = (items: TopicProgress[]) =>
    sort.sorting
      ? [...items].sort((a, b) => {
          const key = sort.sorting!.id;
          const av =
            key === "name"
              ? a.name
              : key === "answered"
                ? a.answered
                : key === "marks"
                  ? a.earned
                  : key === "pct"
                    ? (a.pct ?? -1)
                    : (a.last_answered ?? "");
          const bv =
            key === "name"
              ? b.name
              : key === "answered"
                ? b.answered
                : key === "marks"
                  ? b.earned
                  : key === "pct"
                    ? (b.pct ?? -1)
                    : (b.last_answered ?? "");
          return (
            (typeof av === "string"
              ? av.localeCompare(String(bv))
              : av - Number(bv)) * (sort.sorting!.dir === "desc" ? -1 : 1)
          );
        })
      : items;
  const row = (r: TopicProgress) => (
    <tr
      key={r.id}
      className={r.parent_id ? "bg-muted/35 border-t text-[13px]" : "border-t"}
    >
      <td className={r.parent_id ? "py-2.5 pr-3 pl-11" : "px-5 py-3"}>
        {r.parent_id ? (
          r.name
        ) : (
          <button
            aria-label={r.name}
            aria-expanded={open.has(r.id)}
            onClick={() =>
              setOpen((s) => {
                const next = new Set(s);
                if (next.has(r.id)) next.delete(r.id);
                else next.add(r.id);
                return next;
              })
            }
            className="flex items-center gap-2 text-left font-semibold"
          >
            <PortalIcon
              name="chevron-right"
              className={
                open.has(r.id)
                  ? "text-muted-foreground size-4 shrink-0 rotate-90"
                  : "text-muted-foreground size-4 shrink-0"
              }
            />
            <span className="min-w-0">
              {r.name}
              {r.id === focus && (
                <span className="bg-brand-soft text-brand ml-2 inline-block rounded-full px-2 py-1 text-[11px] font-medium">
                  Focus
                </span>
              )}
            </span>
          </button>
        )}
        <span className="sr-only">
          {r.answered} answered · {r.earned} / {r.possible} marks · Last
          practised{" "}
          {r.last_answered ? dateLabel(r.last_answered, true) : "Not started"}
        </span>
      </td>
      <td className="px-3 text-right">{r.answered}</td>
      <td className="text-muted-foreground px-3 text-right">
        <span className="text-foreground font-medium">{r.earned}</span> /{" "}
        {r.possible}
      </td>
      <td className="px-3">
        {r.pct == null ? (
          <span className="text-muted-foreground">Not started</span>
        ) : (
          <div className="flex items-center gap-3">
            <Meter
              value={r.pct}
              label={`${r.name} average`}
              tone={r.id === focus ? "brand" : "default"}
              className={r.parent_id ? "h-1.5 flex-1" : "h-2 flex-1"}
            />
            <span className="w-10 text-right font-semibold">
              {Math.round(r.pct)}%
            </span>
          </div>
        )}
      </td>
      <td className="text-muted-foreground px-3">
        {r.last_answered ? dateLabel(r.last_answered, true) : "—"}
      </td>
      <td
        className={
          r.parent_id ? "py-2.5 pr-5 text-right" : "py-3 pr-5 text-right"
        }
      >
        <Link
          aria-label={`${r.answered ? "Practise" : "Start"} ${r.name}`}
          href={practiseHref(r)}
          className={buttonVariants({
            variant: r.parent_id ? "ghost" : "outline",
            size: "sm",
            className: r.parent_id ? "text-[13px]" : "border-input!",
          })}
        >
          {r.parent_id ? "Sprint" : "Practise"}
        </Link>
      </td>
    </tr>
  );
  return (
    <div className="relative overflow-x-auto">
      <table
        aria-label="Marks by topic"
        className="w-full min-w-[720px] table-fixed text-sm md:table-auto"
      >
        <colgroup>
          <col className="w-[25%] md:w-[32%]" />
          <col className="w-[11%] md:w-[8%]" />
          <col className="w-[9%]" />
          <col className="w-[30%]" />
          <col className="w-[12%]" />
          <col />
        </colgroup>
        <thead className="text-muted-foreground border-t text-left text-xs">
          <tr>
            {[
              ["name", "Topic"],
              ["answered", "Answered"],
              ["marks", "Marks"],
              ["pct", "Average"],
              ["last", "Last practised"],
            ].map(([id, label]) => (
              <th
                key={id}
                className={`h-10 px-3 font-medium first:pl-5 ${id === "answered" || id === "marks" ? "text-right" : ""}`}
              >
                <button
                  onClick={() =>
                    sort.onSortChange({
                      id,
                      dir:
                        sort.sorting?.id === id && sort.sorting.dir === "asc"
                          ? "desc"
                          : "asc",
                    })
                  }
                >
                  {label}
                </button>
              </th>
            ))}
            <th>
              <span className="sr-only">Practise</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered(parents).map((p) => (
            <Fragment key={p.id}>
              {row(p)}
              {open.has(p.id) &&
                ordered(rows.filter((r) => r.parent_id === p.id)).map(row)}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
