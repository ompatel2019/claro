import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadQuestionCounts: vi.fn(),
  loadTopics: vi.fn(),
  loadImportReview: vi.fn(),
  loadQuestionList: vi.fn(),
  filterBar: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin-questions", () => ({
  loadQuestionCounts: mocks.loadQuestionCounts,
  loadTopics: mocks.loadTopics,
  loadImportReview: mocks.loadImportReview,
  loadQuestionList: mocks.loadQuestionList,
}));
vi.mock("@/components/filter-bar", () => ({ FilterBar: mocks.filterBar }));
vi.mock("@/components/import-review", () => ({ ImportReview: () => null }));
vi.mock("@/app/admin/content/questions/actions", () => ({
  bulkQuestions: vi.fn(),
  undoQuestionChanges: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content/questions",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
import QuestionsPage from "./page";

const counts = { live: 1, draft: 0, retired: 0 };
const pager = {
  page: 1,
  pages: 1,
  total: 0,
  sort: { id: "id", dir: "asc" as const },
};
const review = { tabCount: 0, rows: [], pager };
const list = { rows: [], pager };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: "admin" });
  mocks.loadQuestionCounts.mockResolvedValue(counts);
  mocks.loadTopics.mockResolvedValue([]);
  mocks.loadImportReview.mockResolvedValue(review);
  mocks.loadQuestionList.mockResolvedValue(list);
  mocks.filterBar.mockReturnValue(null);
});
afterEach(cleanup);

it("loads the list and counts with normalised topic filters", async () => {
  render(await QuestionsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.loadQuestionList).toHaveBeenCalledWith({ topic: undefined });
  expect(mocks.loadQuestionCounts).toHaveBeenCalledOnce();
  expect(mocks.filterBar.mock.calls.at(-1)![0].primary).toBe("type");
});

it("links the question source without an ID column", async () => {
  mocks.loadQuestionList.mockResolvedValue({
    rows: [
      {
        id: "question-1",
        source: "HSC Q1",
        year: 2026,
        type: "short",
        topic_id: "t3",
        marks: 2,
        status: "live",
        origin: "claro",
        updated_at: "2026-01-01T00:00:00.000Z",
        attempts: 0,
        avg: null,
        disagreements: 0,
        reports: 0,
      },
    ],
    pager: { ...pager, total: 1 },
  });
  render(await QuestionsPage({ searchParams: Promise.resolve({}) }));

  const table = within(screen.getByRole("table", { name: "Questions" }));
  expect(
    table.queryByRole("columnheader", { name: "ID" }),
  ).not.toBeInTheDocument();
  expect(table.getByRole("link", { name: "HSC Q1" })).toHaveAttribute(
    "href",
    "/admin/content/questions/question-1",
  );
});

it("filters imports by the selected subtopic and drops unrelated subtopics", async () => {
  mocks.loadTopics.mockResolvedValue([
    { id: "t3", parent_id: null },
    { id: "t3-inflation", parent_id: "t3" },
  ]);
  await QuestionsPage({
    searchParams: Promise.resolve({
      status: "review",
      topic: "t3",
      subtopic: "t3-inflation",
    }),
  });
  expect(mocks.loadImportReview).toHaveBeenLastCalledWith(
    0.82,
    NaN,
    true,
    expect.objectContaining({ topic: "t3-inflation" }),
  );
  await QuestionsPage({
    searchParams: Promise.resolve({
      status: "review",
      topic: "t3",
      subtopic: "t2-no-match",
    }),
  });
  expect(mocks.loadImportReview).toHaveBeenLastCalledWith(
    0.82,
    NaN,
    true,
    expect.objectContaining({ topic: "t3" }),
  );
});

it("skips the question list for the review status", async () => {
  const filters = { status: "review", type: "mcq" };
  await QuestionsPage({ searchParams: Promise.resolve(filters) });

  expect(mocks.loadQuestionCounts).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.loadTopics).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.loadImportReview).toHaveBeenCalledExactlyOnceWith(
    0.82,
    NaN,
    true,
    { ...filters, topic: undefined },
  );
  expect(mocks.loadQuestionList).not.toHaveBeenCalled();
});
