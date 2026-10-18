import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  counts: vi.fn(),
  list: vi.fn(),
  table: vi.fn(),
  topics: vi.fn(),
  filters: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-flashcards", () => ({
  loadFlashcardCounts: mocks.counts,
  loadFlashcardList: mocks.list,
}));
vi.mock("@/lib/admin-content", () => ({ loadTopics: mocks.topics }));
vi.mock("@/components/filter-bar", () => ({ FilterBar: mocks.filters }));
vi.mock("@/components/flashcard-import", () => ({
  FlashcardImport: () => null,
}));
vi.mock("@/components/flashcards-table", () => ({
  AddCard: () => null,
  FlashcardsTable: mocks.table,
}));
import FlashcardsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.table.mockReturnValue(null);
  mocks.filters.mockReturnValue(null);
  mocks.topics.mockResolvedValue([]);
  mocks.counts.mockResolvedValue({ own: 1, live: 1101, draft: 0, retired: 2 });
  mocks.list.mockResolvedValue({ rows: [], status: "draft" });
});
afterEach(cleanup);

it("shows whole-bank counts on every tab even with list filters", async () => {
  render(
    await FlashcardsPage({
      searchParams: Promise.resolve({ status: "draft", q: "inflation" }),
    }),
  );
  expect(screen.getByRole("link", { name: "Live (1101)" })).toHaveAttribute(
    "href",
    "/admin/content/flashcards?status=live",
  );
  expect(screen.getByRole("link", { name: "Draft (0)" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Retired (2)" })).toBeVisible();
  expect(
    screen.getByText("Students have made 1 card of their own."),
  ).toBeVisible();
});

it("renders the empty state and remaining counts when individual counts are unavailable", async () => {
  mocks.counts.mockResolvedValue({
    own: null,
    live: 1101,
    draft: null,
    retired: 0,
  });
  render(
    await FlashcardsPage({
      searchParams: Promise.resolve({ status: "draft" }),
    }),
  );
  expect(
    screen.getByRole("link", { name: "Draft (count unavailable)" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Live (1101)" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Retired (0)" })).toBeVisible();
  expect(screen.getByText("Student card count unavailable.")).toBeVisible();
  expect(screen.getByText("No draft cards")).toBeVisible();
});

it("keeps populated cards and pagination when a status count fails", async () => {
  mocks.counts.mockResolvedValue({
    own: 1,
    live: 1101,
    draft: null,
    retired: 0,
  });
  const rows = [{ id: "card-1", front: "Inflation" }];
  const pager = {
    page: 2,
    pages: 3,
    total: 45,
    sort: { id: "updated", dir: "desc" },
  };
  mocks.list.mockResolvedValue({ rows, pager, status: "draft" });
  render(
    await FlashcardsPage({
      searchParams: Promise.resolve({ status: "draft", page: "2" }),
    }),
  );
  expect(mocks.table).toHaveBeenCalledWith(
    { rows, pager, topics: [], status: "draft" },
    undefined,
  );
  expect(screen.queryByText("No draft cards")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Draft (count unavailable)" }),
  ).toHaveAttribute("aria-current", "page");
});

it("separates parents from dependent subtopics and clears stale selections", async () => {
  mocks.topics.mockResolvedValue([
    { id: "t1", name: "Global", parent_id: null, sort: 1 },
    { id: "t3", name: "Issues", parent_id: null, sort: 2 },
    { id: "inflation", name: "Inflation", parent_id: "t3", sort: 3 },
    { id: "trade", name: "Trade", parent_id: "t1", sort: 4 },
  ]);
  render(
    await FlashcardsPage({
      searchParams: Promise.resolve({ topic: "t3", sub: "trade" }),
    }),
  );
  const props = mocks.filters.mock.calls.at(-1)![0];
  expect(props.values.sub).toBeUndefined();
  expect(
    props.filters.find((f: { name: string }) => f.name === "topic"),
  ).toMatchObject({
    clearOnChange: ["sub"],
    options: [
      { value: "t1", label: "Global" },
      { value: "t3", label: "Issues" },
    ],
  });
  expect(
    props.filters.find((f: { name: string }) => f.name === "sub"),
  ).toMatchObject({ options: [{ value: "inflation", label: "Inflation" }] });
});
it("offers no subtopics before choosing a topic", async () => {
  render(
    await FlashcardsPage({ searchParams: Promise.resolve({ sub: "stale" }) }),
  );
  const props = mocks.filters.mock.calls.at(-1)![0];
  expect(props.values.sub).toBeUndefined();
  expect(
    props.filters.find((f: { name: string }) => f.name === "sub"),
  ).toMatchObject({ all: "Choose a topic first", options: [] });
});
