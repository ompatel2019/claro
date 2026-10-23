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
  mocks.eq.mockReturnValue({
    eq: mocks.eq,
    lte: async () => ({ count: 7, error: null }),
  });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);
it("renders range-scoped breakdowns and per-card empty states while keeping untouched topics available", async () => {
  render(
    await resolve(
      await Progress({ searchParams: Promise.resolve({ range: "year" }) }),
    ),
  );
  expect(mocks.load).toHaveBeenCalledWith("year", "2026-10-09");
  expect(
    screen.getByRole("link", { name: "Sprint on Global economy" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t1");
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
  ).toEqual([
    "Marks by topic",
    "Your practice",
    "Where your marks go",
    "By question type",
    "Practice days",
  ]);
  expect(screen.getByText("Marks earned")).toBeVisible();
  expect(screen.getByText("Days studied")).toBeVisible();
  expect(screen.getByRole("link", { name: "Cards due: 7" })).toHaveAttribute(
    "href",
    "/student/flashcards",
  );
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "student");
  expect(mocks.eq).toHaveBeenCalledWith("flashcards.status", "live");
});
it("keeps extended response marks without offering an unsupported sprint", async () => {
  mocks.load.mockResolvedValue({
    ...empty,
    types: [{ id: "extended", answered: 2, pct: 40 }],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(screen.getByText("Extended response")).toBeVisible();
  expect(
    screen.getByRole("meter", { name: "Extended response average" }),
  ).toHaveAttribute("aria-valuenow", "40");
  expect(screen.getByText("2 answered")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /Practise\s*Extended response/ }),
  ).toBeNull();
  for (const [label, type] of [
    ["Multiple choice", "mcq"],
    ["Short answer", "short"],
  ]) {
    expect(
      screen.getByRole("link", { name: new RegExp(`Practise\\s*${label}`) }),
    ).toHaveAttribute("href", `/student/sprint?type=${type}`);
  }
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
    screen.getByText("Questions answered").nextElementSibling,
  ).toHaveTextContent("4");
  expect(
    screen.queryByRole("heading", { name: "Practice average" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Show chart data" })).toBeNull();
  expect(screen.getAllByText("7/10").length).toBeGreaterThan(0);
});

it("excludes unfinished sessions from study time", async () => {
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
  expect(screen.getByText("Study time").nextElementSibling).toHaveTextContent(
    "0h 1m",
  );
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
  expect(screen.getByText("Days studied").nextElementSibling).toHaveTextContent(
    "2",
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
  expect(screen.getByText("Days studied").nextElementSibling).toHaveTextContent(
    "Unavailable",
  );
});

it("includes flashcard sessions in study time without a practice chart", async () => {
  mocks.load.mockResolvedValue({
    ...empty,
    history: [
      {
        id: "cards",
        kind: "flashcards",
        config: {},
        finished_at: "2026-10-09T01:00:00Z",
        elapsed_s: 120,
        pct: 90,
        by_type: {},
      },
    ],
  });
  render(await resolve(await Progress({ searchParams: Promise.resolve({}) })));
  expect(
    screen.queryByRole("img", { name: /Weekly practice average/ }),
  ).toBeNull();
  expect(screen.getByText("Study time").nextElementSibling).toHaveTextContent(
    "0h 2m",
  );
});
