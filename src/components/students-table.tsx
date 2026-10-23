"use client";
import Link from "next/link";
import { PortalIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import { dateLabel, plural } from "@/lib/practice";
import type { StudentRow } from "@/lib/students";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TablePagination } from "@/components/table-pagination";

// Sorting is server-side by column id (STUDENT_KEYS); `sort: true` marks the header.
const columns: Column<StudentRow>[] = [
  {
    id: "name",
    header: "Name",
    sort: true,
    cell: (s) => (
      <Link
        className="font-medium underline-offset-4 hover:underline"
        href={`/admin/students/${s.id}`}
      >
        {s.full_name || "Unnamed"}
      </Link>
    ),
  },
  {
    id: "email",
    header: "Email",
    sort: true,
    cell: (s) => s.email || "No email",
  },
  {
    id: "year",
    header: "Year",
    sort: true,
    cell: (s) => s.year_level ?? "Not set",
  },
  {
    id: "school",
    header: "School",
    sort: true,
    cell: (s) => s.school || "Not set",
  },
  {
    id: "joined",
    header: "Joined",
    sort: true,
    cell: (s) => dateLabel(s.joined, true),
  },
  {
    id: "last",
    header: "Last active",
    sort: true,
    cell: (s) => (s.last_active ? dateLabel(s.last_active, true) : "Never"),
  },
  {
    id: "sessions7",
    header: "Sessions 7d",
    sort: true,
    cell: (s) => s.sessions_7d,
  },
  {
    id: "sessions",
    header: "Sessions total",
    sort: true,
    cell: (s) => s.sessions_total,
  },
  {
    id: "answered",
    header: "Questions answered",
    sort: true,
    cell: (s) => s.answered,
  },
  {
    id: "avg",
    header: "Avg % (30 days)",
    sort: true,
    cell: (s) => (s.avg_30 == null ? "No marks" : `${s.avg_30}%`),
  },
  { id: "streak", header: "Streak", sort: true, cell: (s) => s.streak },
  {
    id: "disputes",
    header: "Open disputes",
    sort: true,
    cell: (s) => s.open_disputes,
  },
  {
    id: "spend",
    header: "AI spend (all time)",
    sort: true,
    cell: (s) => `$${s.ai_spend.toFixed(2)}`,
  },
];

export function StudentsTable({
  students,
  pager,
}: {
  students: StudentRow[];
  pager: Pager;
}) {
  const router = useRouter();
  const responsive = columns.map((c) => ({
    ...c,
    cell:
      c.id === "name"
        ? (s: StudentRow) => (
            <>
              {c.cell(s)}
              <Collapsible
                className="mt-1 text-xs 2xl:hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 py-1 [&[aria-expanded=true]>svg]:rotate-90">
                  <PortalIcon
                    name="chevron-right"
                    className="size-3 transition-transform"
                  />
                  More details
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <dl className="space-y-1 py-2">
                    {columns
                      .filter((column) => !["name", "last"].includes(column.id))
                      .map((column) => (
                        <div
                          key={column.id}
                          className={
                            ["email", "year", "sessions7", "avg"].includes(
                              column.id,
                            )
                              ? "sm:hidden"
                              : undefined
                          }
                        >
                          <dt className="text-muted-foreground">
                            {column.header}
                          </dt>
                          <dd className="wrap-anywhere">{column.cell(s)}</dd>
                        </div>
                      ))}
                  </dl>
                </CollapsibleContent>
              </Collapsible>
            </>
          )
        : c.cell,
    className: cn(
      c.id === "name"
        ? "max-w-48 whitespace-normal wrap-anywhere max-sm:max-w-32"
        : c.id === "last"
          ? "max-sm:px-2"
          : c.id === "email"
            ? "hidden max-w-56 whitespace-normal break-all sm:table-cell"
            : ["year", "sessions7", "avg"].includes(c.id)
              ? "hidden whitespace-normal sm:table-cell"
              : "hidden whitespace-normal 2xl:table-cell",
      [
        "joined",
        "last",
        "sessions7",
        "sessions",
        "answered",
        "avg",
        "streak",
        "disputes",
        "spend",
      ].includes(c.id) && "tabular-nums",
    ),
  }));
  return (
    <>
      <div className="md:hidden">
        <ul
          aria-label="Students"
          className="bg-card divide-y overflow-hidden rounded-2xl border"
        >
          {students.map((student) => (
            <li key={student.id}>
              <Link
                href={`/admin/students/${student.id}`}
                className="hover:bg-accent flex items-center gap-3 px-4 py-4"
              >
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="bg-brand-soft text-brand-text text-sm font-semibold">
                    {(student.full_name || "Unnamed")
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {student.full_name || "Unnamed"}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {student.year_level
                      ? `Year ${student.year_level}`
                      : "Year not set"}{" "}
                    ·{" "}
                    {student.last_active
                      ? `Active ${dateLabel(student.last_active)}`
                      : "Never active"}
                  </span>
                  <Badge
                    className="mt-2"
                    variant={
                      student.blocked
                        ? "destructive"
                        : student.open_disputes
                          ? "warning"
                          : student.sessions_7d
                            ? "success"
                            : "muted"
                    }
                  >
                    {student.blocked
                      ? "Blocked"
                      : student.open_disputes
                        ? plural(student.open_disputes, "open dispute")
                        : student.sessions_7d
                          ? "Active"
                          : "Inactive"}
                  </Badge>
                </span>
                <PortalIcon
                  name="chevron-right"
                  className="text-muted-foreground size-4 shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
        <TablePagination pager={pager} label="Students" />
      </div>
      <div className="hidden md:block">
        <DataTable
          label="Students"
          columns={responsive}
          rows={students}
          pager={pager}
          selectable
          onRow={(s) => router.push(`/admin/students/${s.id}`)}
        />
      </div>
    </>
  );
}
