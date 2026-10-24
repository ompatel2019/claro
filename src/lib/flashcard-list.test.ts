import { expect, it } from "vitest";
import { flashcardPage } from "./flashcard-list";
import type { FlashcardRow } from "./admin-flashcards";
const topics = [
  { id: "parent", parent_id: null, name: "Parent", sort: 1 },
  { id: "child", parent_id: "parent", name: "Inflation", sort: 2 },
];
const rows: FlashcardRow[] = Array.from({ length: 1205 }, (_, i) => ({
  id: String(i).padStart(4, "0"),
  front: `Front ${i}`,
  back: "Back",
  kind: "term",
  topic_id: "child",
  status: "live",
  origin: "claro",
  updated_at: "2026-10-09T00:00:00Z",
  reviews: i,
  knew_first: i ? 50 : null,
  avg: i ? 75 : null,
}));
it("paginates beyond 1000 rows and sorts SQL aggregate values globally", () => {
  const page = flashcardPage(rows, topics, {
    sort: "reviews",
    dir: "desc",
    page: "2",
  });
  expect(page.pager).toMatchObject({ total: 1205, pages: 25, page: 2 });
  expect(page.rows).toHaveLength(50);
  expect(page.rows[0].reviews).toBe(1154);
  expect(
    flashcardPage(rows, topics, { sort: "__proto__", page: "999" }).pager,
  ).toMatchObject({ page: 25, sort: { id: "updated", dir: "desc" } });
});
it("uses topic relationships, searches rendered names and treats query punctuation literally", () => {
  expect(
    flashcardPage(rows, topics, { topic: "parent", q: "inflation" }).pager
      .total,
  ).toBe(1205);
  expect(flashcardPage(rows, topics, { q: "Front 1204" }).rows[0].id).toBe(
    "1204",
  );
  expect(flashcardPage(rows, topics, { q: "%,()" }).rows).toEqual([]);
  expect(flashcardPage(rows, topics, { status: "draft" }).rows).toEqual([]);
});

it("narrows a topic to its subtopic and ignores stale or unrelated subtopic values", () => {
  const tree = [
    ...topics,
    { id: "sibling", parent_id: "parent", name: "Growth", sort: 3 },
    { id: "other", parent_id: null, name: "Other", sort: 4 },
  ];
  const cards = [
    rows[0],
    { ...rows[0], id: "growth", topic_id: "sibling" },
    { ...rows[0], id: "other-card", topic_id: "other" },
  ];
  expect(flashcardPage(cards, tree, { topic: "parent" }).rows).toHaveLength(2);
  expect(
    flashcardPage(cards, tree, { topic: "parent", sub: "sibling" }).rows.map(
      (r) => r.id,
    ),
  ).toEqual(["growth"]);
  for (const sub of ["other", "missing", "parent"])
    expect(
      flashcardPage(cards, tree, { topic: "parent", sub }).rows,
    ).toHaveLength(2);
  expect(flashcardPage(cards, tree, { sub: "sibling" }).rows).toHaveLength(3);
  expect(
    flashcardPage(cards, tree, {
      topic: "parent",
      sub: "sibling",
      q: "Inflation",
    }).rows,
  ).toEqual([]);
});

it("counts each status tab from the same filtered rows the table shows", () => {
  const cards: FlashcardRow[] = [
    { ...rows[0], id: "live-cpi", front: "CPI" },
    { ...rows[0], id: "live-gdp", front: "GDP" },
    { ...rows[0], id: "live-stat", front: "CPI rate", kind: "stat" },
    { ...rows[0], id: "draft-cpi", front: "CPI basket", status: "draft" },
    { ...rows[0], id: "retired", front: "Old", status: "retired" },
  ];
  const all = flashcardPage(cards, topics, {});
  expect(all.counts).toEqual({ live: 3, draft: 1, retired: 1 });
  expect(all.pager.total).toBe(all.counts.live);
  const cpiTerms = flashcardPage(cards, topics, { q: "cpi", kind: "term" });
  expect(cpiTerms.counts).toEqual({ live: 1, draft: 1, retired: 0 });
  expect(cpiTerms.rows.map((r) => r.id)).toEqual(["live-cpi"]);
  const drafts = flashcardPage(cards, topics, { status: "draft", q: "cpi" });
  expect(drafts.pager.total).toBe(drafts.counts.draft);
});
