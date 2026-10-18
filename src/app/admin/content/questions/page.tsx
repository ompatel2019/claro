import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { QuestionFile, SearchOff } from "@/components/icons";
import { requireAdmin } from "@/lib/auth";
import { singleParams } from "@/lib/admin";
import { loadImportReview } from "@/lib/admin-questions";
import {
  loadQuestionCounts,
  loadQuestionList,
  loadTopics,
} from "@/lib/admin-questions";
import {
  COMPLETENESS,
  QUESTION_FILTER_KEYS,
  ORIGIN_LABELS,
  REVIEW_THRESHOLD,
  TYPE_LABELS,
  VERBS,
} from "@/lib/question-bank";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { ImportReview } from "@/components/import-review";
import { LinkTabs } from "@/components/link-tabs";
import { PageHeader } from "@/components/page-header";
import { QuestionsTable } from "@/components/questions-table";
import { buttonVariants } from "@/components/ui/button";

const BASE = "/admin/content/questions";

export const metadata = pageMetadata("Questions");

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const f = singleParams(await searchParams);
  const topicRows = await loadTopics();
  const parent = topicRows.find((t) => t.id === f.topic);
  const parentId = parent?.parent_id ?? parent?.id;
  const subtopic = topicRows.find(
    (t) =>
      t.id === (f.subtopic ?? (parent?.parent_id ? parent.id : undefined)) &&
      t.parent_id === parentId,
  );
  const filters = { ...f, topic: subtopic?.id ?? parentId };
  const status = ["live", "draft", "review", "retired"].includes(f.status ?? "")
    ? f.status!
    : "live";
  const threshold = Math.min(
    0.99,
    Math.max(0.6, Number(f.threshold) || REVIEW_THRESHOLD),
  );
  // The list does not depend on the badge counts, so it loads alongside them.
  const [counts, review, list] = await Promise.all([
    loadQuestionCounts(),
    loadImportReview(
      threshold,
      Number(f.page),
      status === "review",
      status === "review" ? filters : {},
    ),
    status === "review" ? null : loadQuestionList(filters),
  ]);
  const filtered = QUESTION_FILTER_KEYS.some((k) => f[k]);
  const topics = topicRows;
  const parents = topics.filter((t) => !t.parent_id);
  const filterBar = (
    <FilterBar
      customSelect
      values={{ ...f, topic: parentId, subtopic: subtopic?.id }}
      hidden={{
        status,
        threshold: status === "review" ? String(threshold) : undefined,
      }}
      filters={[
        { name: "q", label: "Search", placeholder: "ID, source or stem" },
        {
          name: "type",
          label: "Type",
          all: "Any",
          options: Object.entries(TYPE_LABELS).map(([value, label]) => ({
            value,
            label,
          })),
        },
        {
          name: "topic",
          label: "Topic",
          all: "Any",
          clearOnChange: ["subtopic"],
          options: parents.map((p) => ({
            value: p.id,
            label: `${p.sort}. ${p.name}`,
          })),
        },
        {
          name: "subtopic",
          label: "Subtopic",
          all: parentId ? "Any" : "Choose a topic first",
          options: topics
            .filter((t) => t.parent_id === parentId)
            .map((t) => ({ value: t.id, label: t.name })),
        },
        {
          name: "from",
          label: "Year from",
          placeholder: "2015",
          inputMode: "numeric",
        },
        {
          name: "to",
          label: "Year to",
          placeholder: "2025",
          inputMode: "numeric",
        },
        {
          name: "origin",
          label: "Origin",
          all: "Any",
          options: Object.entries(ORIGIN_LABELS).map(([value, label]) => ({
            value,
            label,
          })),
        },
        {
          name: "verb",
          label: "Verb",
          all: "Any",
          options: VERBS.map((v) => ({ value: v, label: v })),
        },
        {
          name: "marks",
          label: "Marks",
          placeholder: "4",
          inputMode: "numeric",
        },
        {
          name: "missing",
          label: "Completeness",
          all: "Any",
          options: Object.entries(COMPLETENESS).map(([value, label]) => ({
            value,
            label:
              value === "criteria" && status !== "review"
                ? "Missing or incomplete criteria"
                : label,
          })),
        },
      ]}
    />
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Questions"
        description="Import drafts offline, then review, publish or edit them here."
        actions={
          <Link href={`${BASE}?status=review`} className={buttonVariants()}>
            Import
          </Link>
        }
      />
      <LinkTabs
        label="Question status"
        active={status}
        tabs={[
          {
            value: "live",
            label: "Live",
            count: counts.live,
            href: `${BASE}?status=live`,
          },
          {
            value: "draft",
            label: "Draft",
            count: counts.draft,
            href: `${BASE}?status=draft`,
          },
          {
            value: "review",
            label: "Import review",
            count: review.tabCount,
            href: `${BASE}?status=review`,
          },
          {
            value: "retired",
            label: "Retired",
            count: counts.retired,
            href: `${BASE}?status=retired`,
          },
        ]}
      />
      {status === "review" ? (
        <div className="min-w-0 space-y-4">
          {filterBar}
          <ImportReview
            key={threshold}
            rows={review.rows}
            pager={review.pager}
            threshold={threshold}
            filtered={filtered}
          />
        </div>
      ) : (
        <>
          {filterBar}
          {list!.rows.length ? (
            <QuestionsTable
              rows={list!.rows}
              pager={list!.pager}
              topics={topics}
              status={status}
            />
          ) : (
            <EmptyState
              icon={filtered ? SearchOff : QuestionFile}
              title={filtered ? "No questions match" : `No ${status} questions`}
              description={
                filtered
                  ? "Try another search or clear the filters."
                  : "Questions with this status appear here."
              }
              action={
                filtered ? (
                  <Link
                    href={`${BASE}?status=${status}`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Clear filters
                  </Link>
                ) : undefined
              }
            />
          )}
        </>
      )}
    </div>
  );
}
