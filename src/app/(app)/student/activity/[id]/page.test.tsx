import { cleanup, render, screen } from "@testing-library/react";
import { resolve } from "@/test/resolve-server-components";
import { expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({
  kind: "paper",
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("404");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/single-check-data", () => ({
  bankQuestions: vi.fn(),
  remainingChecks: vi.fn(),
}));
vi.mock("@/components/mark-my-answer", () => ({ MarkMyAnswer: () => null }));
vi.mock("@/components/results-report", () => ({
  ResultsAnswers: ({ singleResult }: { singleResult?: boolean }) => (
    <div data-testid="results" data-single={String(singleResult)} />
  ),
}));
vi.mock("./sprint-results", () => ({
  SprintResults: ({ id }: { id: string }) => (
    <div data-testid="sprint-results" data-id={id} />
  ),
}));
vi.mock("@/components/marking-progress", () => ({
  MarkingProgress: () => null,
}));
vi.mock("@/components/feedback-widget", () => ({
  ReportProblem: () => <button>Report a problem</button>,
  useFeedback: () => vi.fn(),
}));
afterEach(cleanup);
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
import Page from "./page";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: { kind: mocks.kind }, error: null }),
  }));
});
it("returns not found for an existing paper row without reading its attempts", async () => {
  mocks.kind = "paper";
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "404",
  );
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("sessions");
});
it("preserves the flashcards report redirect", async () => {
  mocks.kind = "flashcards";
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    `redirect:/student/flashcards/${id}`,
  );
});

it("renders sprint results here for the owner", async () => {
  mocks.kind = "sprint";
  render(await resolve(await Page({ params: Promise.resolve({ id }) })));
  expect(screen.getByTestId("sprint-results")).toHaveAttribute("data-id", id);
});

it("returns not found for another user's session without reading its attempts", async () => {
  const filters: [string, unknown][] = [];
  mocks.from.mockImplementation(() => ({
    select() {
      return this;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return this;
    },
    // RLS and the owner filter both hide another student's row.
    maybeSingle: async () => ({ data: null, error: null }),
  }));
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "404",
  );
  expect(filters).toContainEqual(["user_id", "u"]);
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("sessions");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("returns not found for a malformed id before querying", async () => {
  await expect(
    Page({ params: Promise.resolve({ id: "not-a-uuid" }) }),
  ).rejects.toThrow("404");
  expect(mocks.from).not.toHaveBeenCalled();
});

it.each([
  [1, "marked"],
  [1, "marking"],
  [1, "pending"],
  [2, "marked"],
])(
  "uses the standalone question header only for one written answer (%s rows)",
  async (count, status) => {
    const row = {
      attempt_id: "attempt",
      type: "short",
      marks: 4,
      max_marks: 4,
      mark: 3,
      status,
      check_status: "agreed",
      stem: "Explain low wage growth.\n\n| Year | Wages |\n| --- | --- |\n| 2025 | 3% |",
      topic_id: "growth",
      question_id: "q1",
      feedback: null,
      image_paths: [],
      source: "HSC",
    };
    mocks.rpc.mockResolvedValue({
      data: Array.from({ length: count }, () => row),
      error: null,
    });
    mocks.from.mockImplementation((table: string) => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: {
          kind: "single",
          config: {},
          started_at: "2026-10-18T00:00:00Z",
          finished_at: "2026-10-19T00:00:00Z",
        },
        error: null,
      }),
      order: async () => ({
        data:
          table === "attempts"
            ? [row]
            : [{ id: "growth", name: "Economic growth" }],
        error: null,
      }),
    }));
    render(await resolve(await Page({ params: Promise.resolve({ id }) })));
    if (count === 1 && status === "marked") {
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Explain low wage growth.",
        }),
      ).toBeVisible();
      expect(screen.getByText(/^Marked /)).toHaveTextContent(
        "Economic growth · 4 marks",
      );
      expect(screen.getByRole("table")).toHaveTextContent("YearWages20253%");
      expect(screen.getByRole("img", { name: "3 out of 4" })).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Rewrite answer" }),
      ).toHaveAttribute("href", "/student/mark?question=q1");
      expect(
        screen.getByRole("button", { name: "Report a problem" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Question this mark" }),
      ).toBeInTheDocument();
      return;
    }
    expect(screen.getByTestId("results")).toHaveAttribute(
      "data-single",
      String(count === 1),
    );
    if (count === 1) {
      expect(
        screen.getByRole("heading", { level: 1, name: "Answer results" }),
      ).toBeVisible();
      expect(screen.getByText(/Economic growth · 4 marks/)).toHaveTextContent(
        /^Submitted /,
      );
      expect(screen.queryByText(/^Marked /)).not.toBeInTheDocument();
      expect(screen.getByRole("table")).toHaveTextContent("YearWages20253%");
      expect(screen.getByText("Explain low wage growth.")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Report a problem" }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Practise similar" }),
      ).toHaveAttribute("href", "/student/sprint?type=short&sub=growth");
    } else {
      expect(
        screen.getByRole("heading", { level: 1, name: "Mark my answer" }),
      ).toBeVisible();
    }
  },
);
