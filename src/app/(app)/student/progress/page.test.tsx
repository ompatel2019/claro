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
  eq: vi.fn(),
  rpc: vi.fn(),
  marked: vi.fn(),
  scores: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: mocks.eq }) }),
  }),
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "student" }),
}));
vi.mock("@/lib/progress-data", () => ({
  loadProgress: mocks.load,
  loadMarkedComments: mocks.marked,
  loadSessionScores: mocks.scores,
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
  history: [],
  mastery: [],
  missed: [],
  due: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(empty);
  mocks.marked.mockResolvedValue({ rows: [], complete: true });
  mocks.scores.mockResolvedValue([]);
  mocks.eq.mockReturnValue({
    eq: mocks.eq,
    lte: async () => ({ count: 7, error: null }),
  });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);
it("renders the redesigned cards with range-scoped empty states", async () => {
  render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "year" }) }),
    ),
  );
  expect(mocks.load).toHaveBeenCalledWith("year", "2026-10-09");
  expect(mocks.marked).toHaveBeenCalledWith("student", "2026-01-01");
  expect(
    screen.getByRole("link", { name: "Practise Global economy" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t1");
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
  ).toEqual([
    "Practice average",
    "Where you’re losing marks",
    "What the marker keeps asking for",
    "Exam readiness",
    "Marks by topic",
  ]);
  expect(
    screen.getByText("No finished practice sessions this year."),
  ).toBeVisible();
  expect(mocks.scores).toHaveBeenCalledWith("student", "2026-01-01");
  expect(screen.queryByText(/study time|of practice/i)).toBeNull();
  expect(screen.getByText("No marks lost this year.")).toBeVisible();
  expect(
    screen.getByText("No marked written answers this year."),
  ).toBeVisible();
  expect(screen.getByText("No marks yet")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "7 flashcards due today" }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(screen.queryByText(/band/i)).toBeNull();
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "student");
  expect(mocks.eq).toHaveBeenCalledWith("flashcards.status", "live");
});
it("shows each part of the paper against the target, with no band", async () => {
  mocks.load.mockResolvedValue({
    ...empty,
    types: [
      { id: "extended", answered: 2, pct: 40 },
      { id: "mcq", answered: 12, pct: 66.6 },
    ],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(
    screen.getByRole("meter", {
      name: "Sections III and IV · Extended response average",
    }),
  ).toHaveAttribute("aria-valuenow", "40");
  expect(screen.getByText("2 responses marked")).toBeVisible();
  expect(screen.getByText("12 questions answered")).toBeVisible();
  expect(screen.getByText("67%")).toBeVisible();
  expect(screen.getByText("0 questions answered")).toBeVisible();
  expect(screen.getByText("18 days to go")).toBeVisible();
  expect(screen.queryByText(/band/i)).toBeNull();
});
it("lists the marker's real tagged fixes and an unavailable state", async () => {
  mocks.marked.mockResolvedValue({
    complete: true,
    rows: [
      {
        marked_at: "2026-10-08T00:00:00Z",
        comments: [
          {
            kind: "fix",
            tag: "Evidence",
            body: "Use a figure",
            next_mark: "Quote the 3.8% rate.",
          },
        ],
      },
    ],
  });
  const view = render(
    await resolve(await Progress({ searchParams: Promise.resolve({}) })),
  );
  expect(screen.getByText("Specific evidence and examples")).toBeVisible();
  expect(screen.getByText("Quote the 3.8% rate.")).toBeVisible();
  expect(screen.getByText("1 answer")).toBeVisible();
  view.unmount();
  mocks.marked.mockResolvedValue(null);
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(
    screen.getByText("Marker comments are unavailable right now."),
  ).toBeVisible();
});
it("ranks lost marks by dot point with a practise link", async () => {
  mocks.load.mockResolvedValue({
    ...empty,
    topics: [
      { ...empty.topics[0], answered: 6, earned: 3, possible: 12, pct: 25 },
      {
        ...empty.topics[0],
        id: "inf",
        parent_id: "t1",
        name: "Inflation",
        answered: 6,
        sessions: 3,
        earned: 3,
        possible: 12,
        pct: 25,
        last_answered: "2026-10-08T00:00:00Z",
      },
    ],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(screen.getByText("Global economy · lost 9 of 12 marks")).toBeVisible();
  expect(
    screen.getAllByRole("link", { name: "Practise Inflation" })[0],
  ).toHaveAttribute("href", "/student/sprint?topics=t1&sub=inf");
  expect(screen.getAllByText("Focus").length).toBeGreaterThan(0);
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

it("counts every marked answer from the RPC stats, with parent sums as a fallback", async () => {
  const topics = [
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
  ];
  mocks.load.mockResolvedValue({ ...empty, topics });
  const view = render(
    await resolve(await Progress({ searchParams: Promise.resolve({}) })),
  );
  expect(screen.getByTestId("progress-meta")).toHaveTextContent(
    "From your marked answers: 4 questions",
  );
  expect(screen.getByText("1 of 1")).toBeVisible();
  view.unmount();
  // stats include answers to questions with no topic; the headline is that weighted share.
  mocks.load.mockResolvedValue({
    ...empty,
    topics,
    stats: { answered: 9, earned: 8, possible: 16, pct: 50, active: 2 },
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(screen.getByTestId("progress-meta")).toHaveTextContent(
    "From your marked answers: 9 questions",
  );
  expect(
    screen.getByText("50%", { selector: ".progress-trend-avg" }),
  ).toBeVisible();
  expect(
    screen.getByText("9 marked answers in the last 90 days"),
  ).toBeVisible();
});
it("charts scored sessions with a screen-reader table", async () => {
  mocks.load.mockResolvedValue({
    ...empty,
    stats: { answered: 5, earned: 3, possible: 5, pct: 60, active: 1 },
  });
  mocks.scores.mockResolvedValue([
    { finished_at: "2026-10-08T01:00:00Z", score: 31, max_score: 50 },
  ]);
  render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "7" }) }),
    ),
  );
  expect(
    screen.getByText("60%", { selector: ".progress-trend-avg" }),
  ).toBeVisible();
  expect(screen.getByText("5 marked answers in the last 7 days")).toBeVisible();
  expect(
    screen.getByRole("table", { name: /Practice average by day/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("62%").length).toBeGreaterThan(0);
});
it("counts only active days and handles an unavailable activity summary", async () => {
  mocks.rpc.mockResolvedValue({
    data: [
      { day: "2026-10-08", questions: 2, cards: 0 },
      { day: "2026-10-09", questions: 0, cards: 3 },
      { day: "2026-10-07", questions: 0, cards: 0 },
    ],
    error: null,
  });
  const view = render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "30" }) }),
    ),
  );
  expect(screen.getByTestId("progress-meta")).toHaveTextContent(
    "over 2 active days",
  );
  expect(mocks.rpc).toHaveBeenCalledWith("activity_days", {
    p_from: "2026-09-10",
    p_to: "2026-10-09",
  });
  view.unmount();
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "unavailable" },
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(screen.getByTestId("progress-meta")).not.toHaveTextContent(
    "active day",
  );
});

it("shows no study-time figure and an unavailable chart state", async () => {
  mocks.scores.mockResolvedValue(null);
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(
    screen.getByText("Your session history is unavailable right now."),
  ).toBeVisible();
  expect(screen.getByTestId("progress-meta")).not.toHaveTextContent(/\dh \d+m/);
});
