import { resolve } from "@/test/resolve-server-components";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProgressData } from "@/lib/progress";
import Progress from "./page";
import ErrorCard from "./error";
import Loading from "./loading";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: async () => ({ data: [], error: null }) }),
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "student" }),
}));
vi.mock("@/lib/progress-data", () => ({
  loadProgress: mocks.load,
  progressToday: () => "2026-10-09",
}));
vi.mock("@/components/progress-controls", () => ({
  ProgressControls: () => null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/student/progress",
}));
const empty: ProgressData = {
  topics: [
    {
      id: "t1",
      parent_id: null,
      name: "Global economy",
      sort: 1,
      answered: 0,
      earned: 0,
      possible: 0,
      pct: null,
      last_answered: null,
    },
  ],
  types: [],
  verbs: [],
  history: [],
  mastery: [],
  missed: [],
  due: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(empty);
});
afterEach(cleanup);
it("renders range-scoped breakdowns and per-card empty states while keeping untouched topics available", async () => {
  render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "year" }) }),
    ),
  );
  expect(mocks.load).toHaveBeenCalledWith("year", "2026-10-09");
  expect(screen.getAllByText("No activity in this range")).toHaveLength(2);
  expect(screen.getByText("By question type")).toBeInTheDocument();
  expect(screen.getByText("By directive verb")).toBeInTheDocument();
  expect(screen.getByText("Weak spots")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Start Global economy" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t1");
  expect(screen.queryByTestId("progress-stats")).toBeNull();
  expect(screen.queryByText("Year heatmap")).toBeNull();
  expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
    "Against your target",
  );
});
it("passes load failures to the route error boundary", async () => {
  mocks.load.mockRejectedValue(new Error("unavailable"));
  await expect(Progress({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "unavailable",
  );
});
it("provides a route retry and card-shaped loading skeletons", () => {
  const retry = vi.fn();
  const view = render(<ErrorCard unstable_retry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  view.unmount();
  const loading = render(<Loading />);
  expect(screen.getByLabelText("Loading progress")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(
    loading.container.querySelectorAll('[data-slot="skeleton"]').length,
  ).toBeGreaterThan(10);
});

it("links each finished session to its correct report and scopes type chips to score history", async () => {
  const base = {
    config: { mode: "short" },
    finished_at: "2026-10-09T01:00:00Z",
    elapsed_s: 100,
    pct: 80,
    by_type: { short: 60 },
  };
  mocks.load.mockResolvedValue({
    ...empty,
    history: [
      { ...base, id: "sprint", kind: "sprint" },
      {
        ...base,
        id: "sit",
        kind: "paper",
      },
      { ...base, id: "cards", kind: "flashcards", by_type: {} },
      { ...base, id: "single", kind: "single" },
    ],
  });
  const view = render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "all" }) }),
    ),
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Show chart data" })[0],
  );
  expect(
    screen.getAllByRole("link", { name: /Short answer sprint/ })[0],
  ).toHaveAttribute("href", "/student/sprint/sprint/results");
  expect(
    screen.getAllByRole("link", { name: /Flashcards/ })[0],
  ).toHaveAttribute("href", "/student/flashcards/cards");
  expect(
    screen.getAllByRole("link", { name: /Mark my answer/ })[0],
  ).toHaveAttribute("href", "/student/activity/single");
  view.unmount();
  render(
    await resolve(
      await Progress({
        searchParams: Promise.resolve({
          range: "all",
          type: "short",
          kind: "sprint",
        }),
      }),
    ),
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Show chart data" })[0],
  );
  expect(
    screen.getAllByRole("link", { name: /Short answer sprint/ })[0],
  ).toHaveAttribute("href", "/student/sprint/sprint/results");
  expect(
    screen.getAllByRole("link", { name: /Short answer sprint/ })[0],
  ).toHaveAccessibleName(/60%/);
  expect(screen.queryByRole("link", { name: /Flashcards/ })).toBeNull();
});

it("keeps weak spots locked until both history boundaries", async () => {
  const topic = {
    ...empty.topics[0],
    id: "synthetic",
    parent_id: "t1",
    name: "Synthetic topic",
    answered: 2,
    sessions: 2,
    pct: 20,
  };
  mocks.load.mockResolvedValue({ ...empty, topics: [topic] });
  const view = render(
    await resolve(await Progress({ searchParams: Promise.resolve({}) })),
  );
  expect(
    screen.getByText(/Answer 1 more question in Synthetic topic/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Retry questions$/ })).toBeNull();
  view.unmount();
  mocks.load.mockResolvedValue({
    ...empty,
    topics: [{ ...topic, answered: 3, sessions: 1 }],
  });
  const locked = render(
    await resolve(await Progress({ searchParams: Promise.resolve({}) })),
  );
  expect(
    screen.getByText(/Practise in one more session to unlock/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Retry questions$/ })).toBeNull();
  locked.unmount();
  mocks.load.mockResolvedValue({
    ...empty,
    topics: [{ ...topic, answered: 3 }],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(
    screen.getByRole("link", { name: /^Retry questions$/ }),
  ).toHaveAttribute(
    "href",
    "/student/sprint?topics=t1&sub=synthetic&history=mistakes",
  );
});

it("derives the practice summary from parent topic marks without counting subtopics twice", async () => {
  mocks.load.mockResolvedValue({
    ...empty,
    topics: [
      { ...empty.topics[0], answered: 4, earned: 7, possible: 10, pct: 70 },
      {
        ...empty.topics[0],
        id: "child",
        parent_id: "t1",
        answered: 4,
        earned: 7,
        possible: 10,
        pct: 70,
      },
    ],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(
    screen.getByRole("img", { name: "70% practice average; target 80%" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("4 marked answers in the last 90 days"),
  ).toBeInTheDocument();
  expect(screen.getByText("Against your target")).toBeInTheDocument();
  expect(screen.getByText("10 pts")).toBeInTheDocument();
  expect(screen.queryByText(/^Since /)).toBeNull();
});

it("rejects missing finish dates before converting them to Sydney dates", async () => {
  const session = {
    id: "valid",
    kind: "sprint",
    config: {},
    finished_at: "2026-10-08T00:00:00Z",
    elapsed_s: 60,
    pct: 75,
    by_type: {},
  };
  mocks.load.mockResolvedValue({
    ...empty,
    history: [session, { ...session, id: "unfinished", finished_at: null }],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Show chart data" })[0],
  );
  expect(screen.getAllByRole("link", { name: /75%/ })).toHaveLength(1);
  expect(screen.queryByText(/1970/)).toBeNull();
  expect(screen.queryByRole("link", { name: /unfinished/ })).toBeNull();
});

it("derives the target gap and change from the first scored week in the selected range", async () => {
  const session = { kind: "sprint", config: {}, elapsed_s: 60, by_type: {} };
  mocks.load.mockResolvedValue({
    ...empty,
    topics: [
      { ...empty.topics[0], answered: 4, earned: 9, possible: 10, pct: 90 },
    ],
    history: [
      {
        ...session,
        id: "outside",
        finished_at: "2026-08-01T01:00:00Z",
        pct: 10,
      },
      { ...session, id: "first", finished_at: "2026-09-14T01:00:00Z", pct: 40 },
      {
        ...session,
        id: "second",
        finished_at: "2026-09-15T01:00:00Z",
        pct: 60,
      },
      { ...session, id: "now", finished_at: "2026-10-08T01:00:00Z", pct: 90 },
    ],
  });
  render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "30" }) }),
    ),
  );
  expect(screen.getByText("On target")).toBeInTheDocument();
  expect(screen.getByText("Since September")).toBeInTheDocument();
  expect(screen.getByText("+40 pts")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});
