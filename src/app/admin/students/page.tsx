import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { ArrowDown, SearchOff, Users } from "@/components/icons";
import { loadStudentRows } from "@/lib/admin-data";
import { pageOf, singleParams, sydneyDay, tableParams } from "@/lib/admin";
import { plural } from "@/lib/practice";
import { ACTIVITY, filterStudents, STUDENT_KEYS } from "@/lib/students";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { StudentsTable } from "@/components/students-table";
import { buttonVariants } from "@/components/ui/button";

export const metadata = pageMetadata("Students");

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = singleParams(await searchParams);
  const all = await loadStudentRows();
  const shown = filterStudents(all, f, sydneyDay, sydneyDay(new Date()));
  const { sort, page } = tableParams(f, { id: "last", dir: "desc" });
  const { rows, pager } = pageOf(shown, STUDENT_KEYS, sort, page, {
    id: "last",
    dir: "desc",
  });
  const query = new URLSearchParams(
    Object.entries(f).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  return (
    <div className="table-hairline [&_[data-slot=table]]:border-border space-y-6">
      <PageHeader
        title="Students"
        description={plural(shown.length, "student")}
        actions={
          <a
            href={`/admin/students/export${query ? `?${query}` : ""}`}
            className={buttonVariants({ variant: "outline" })}
            download
          >
            <ArrowDown aria-hidden />
            Export CSV
          </a>
        }
      />
      {all.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Students appear here when they sign up."
        />
      ) : (
        <>
          <FilterBar
            customSelect
            values={f}
            hidden={{ sort: pager.sort.id, dir: pager.sort.dir }}
            primary="year"
            filters={[
              {
                name: "q",
                label: "Search",
                placeholder: "Search students",
              },
              {
                name: "year",
                label: "Year",
                all: "Any",
                options: [
                  { value: "11", label: "Year 11" },
                  { value: "12", label: "Year 12" },
                ],
              },
              {
                name: "activity",
                label: "Activity",
                all: "Any",
                options: Object.entries(ACTIVITY).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
              { name: "disputes", label: "Has open disputes", checkbox: true },
            ]}
          />
          {shown.length > 0 && <StudentsTable students={rows} pager={pager} />}
          {shown.length === 0 && (
            <EmptyState
              icon={SearchOff}
              title="No students match"
              description="Try another search or clear the filters."
              action={
                <Link
                  href="/admin/students"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Clear filters
                </Link>
              }
            />
          )}
        </>
      )}
    </div>
  );
}
