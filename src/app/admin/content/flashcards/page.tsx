import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { singleParams } from "@/lib/admin";
import { loadFlashcardCounts, loadFlashcardList } from "@/lib/admin-flashcards";
import { loadTopics } from "@/lib/admin-content";
import { FilterBar } from "@/components/filter-bar";
import { FlashcardImport } from "@/components/flashcard-import";
import { AddCard, FlashcardsTable } from "@/components/flashcards-table";
import { LinkTabs } from "@/components/link-tabs";
import { EmptyState, PageHeader } from "@/components/claro/layout";
import { buttonVariants } from "@/components/ui/button";

const BASE = "/admin/content/flashcards";

export const metadata = pageMetadata("Flashcards");

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const f = singleParams(await searchParams);
  const [counts, topics, list] = await Promise.all([
    loadFlashcardCounts(),
    loadTopics(),
    loadFlashcardList(f),
  ]);
  const subtopics = topics.filter((t) => t.parent_id === f.topic);
  if (!subtopics.some((t) => t.id === f.sub)) delete f.sub;
  const filtered = ["q", "kind", "topic", "sub", "origin"].some((k) => f[k]);
  const parents = topics.filter((t) => !t.parent_id);
  return (
    <div>
      <PageHeader
        title="Flashcards"
        description={
          counts.own === null
            ? "Student card count unavailable."
            : `Students have made ${counts.own.toLocaleString("en-AU")} ${counts.own === 1 ? "card" : "cards"} of their own.`
        }
        actions={
          <>
            <FlashcardImport topics={topics} />
            <AddCard topics={topics} />
          </>
        }
      />
      <div className="space-y-5">
        <LinkTabs
          label="Flashcard status"
          active={list.status}
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
              value: "retired",
              label: "Retired",
              count: counts.retired,
              href: `${BASE}?status=retired`,
            },
          ]}
        />
        <FilterBar
          customSelect
          primary="topic"
          values={f}
          hidden={{ status: list.status }}
          filters={[
            { name: "q", label: "Search", placeholder: "Front, back or ID" },
            {
              name: "kind",
              label: "Kind",
              all: "Any",
              options: [
                { value: "term", label: "Term" },
                { value: "stat", label: "Stat" },
              ],
            },
            {
              name: "topic",
              label: "Topic",
              all: "Any",
              clearOnChange: ["sub"],
              options: parents.map((p) => ({ value: p.id, label: p.name })),
            },
            {
              name: "sub",
              label: "Subtopic",
              all: f.topic ? "Any subtopic" : "Choose a topic first",
              options: subtopics.map((t) => ({ value: t.id, label: t.name })),
            },
            {
              name: "origin",
              label: "Origin",
              all: "Any",
              options: [
                { value: "a1", label: "A1" },
                { value: "claro", label: "Claro" },
              ],
            },
          ]}
        />
        {list.rows.length ? (
          <FlashcardsTable
            rows={list.rows}
            pager={list.pager}
            topics={topics}
            status={list.status}
          />
        ) : (
          <EmptyState
            title={filtered ? "No cards match" : `No ${list.status} cards`}
            description={
              filtered
                ? "Try another search or clear the filters."
                : "Add a card or import a file to get started."
            }
            action={
              filtered ? (
                <Link
                  href={`${BASE}?status=${list.status}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
