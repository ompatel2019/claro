import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "@/test/resolve-server-components";
import type { ProgressData, TopicProgress } from "@/lib/progress";
import type { Session } from "@/lib/practice";
import { DEFAULTS } from "@/lib/sprint";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));
import {
  HomePlan,
  HomeRecent,
  HomeStats,
  readHomeSessions,
  readHomeUnfinishedSprint,
} from "./sections";

const topic: TopicProgress = {
  id: "economic-growth",
  parent_id: null,
  name: "Economic growth",
  sort: 1,
  answered: 3,
  sessions: 2,
  earned: 3,
  possible: 10,
  pct: 30,
  last_answered: null,
};
const progress = (topics = [topic]): ProgressData => ({
  topics,
  types: [],
  verbs: [],
  history: [],
  mastery: [],
  missed: [],
  due: [],
});
const session: Session = {
  id: "old-open",
  user_id: "student",
  kind: "sprint",
  config: { ...DEFAULTS, topics: [topic.id] },
  started_at: "2026-10-01T00:00:00Z",
  finished_at: null,
  score: null,
  max_score: null,
  elapsed_s: 0,
  summary: null,
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each([
  { answered: 1, sessions: 1, pct: 0 },
  { answered: 3, sessions: 1, pct: 0 },
  { answered: 2, sessions: 2, pct: 0 },
  { answered: 3, sessions: 2, pct: 60 },
])("does not recommend an unqualified weak topic: %j", async (sample) => {
  render(
    await HomePlan({
      sessions: Promise.resolve([]),
      progress: Promise.resolve(progress([{ ...topic, ...sample }])),
      unfinished: Promise.resolve(null),
      due: Promise.resolve(0),
    }),
  );
  expect(
    screen.queryByText(/Practise Economic growth/),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Start a sprint to build/)).toBeVisible();
});
it("chooses the lowest qualified weak topic and ignores sparse lower scores", async () => {
  render(
    await HomePlan({
      sessions: Promise.resolve([]),
      progress: Promise.resolve(
        progress([
          { ...topic, id: "sparse", name: "Sparse", answered: 1, pct: 0 },
          { ...topic, id: "higher", name: "Higher", pct: 50 },
          topic,
        ]),
      ),
      unfinished: Promise.resolve(null),
      due: Promise.resolve(0),
    }),
  );
  expect(
    screen.getByRole("link", { name: /Practise Economic growth/ }),
  ).toHaveAttribute("href", "/student/sprint?topics=economic-growth");
  expect(screen.getByText("30% average")).toBeVisible();
  expect(
    screen.queryByText(/Practise Sparse|Practise Higher/),
  ).not.toBeInTheDocument();
});
it("finds an owned unfinished sprint outside the five recent sessions", async () => {
  const recent = Array.from({ length: 5 }, (_, i) => ({
    ...session,
    id: `recent-${i}`,
    finished_at: "2026-10-20T00:00:00Z",
  }));
  const eq = vi.fn();
  const is = vi.fn();
  const query = {
    select: vi.fn().mockReturnThis(),
    eq,
    is,
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn((n: number) =>
      n === 5 ? Promise.resolve({ data: recent }) : query,
    ),
    maybeSingle: vi.fn(async () => ({ data: session, error: null })),
  };
  eq.mockReturnValue(query);
  is.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  expect(await readHomeSessions("student")).toEqual(recent);
  const unfinished = readHomeUnfinishedSprint("student");
  render(
    await HomePlan({
      sessions: Promise.resolve([]),
      progress: Promise.resolve(progress([])),
      unfinished,
      due: Promise.resolve(0),
    }),
  );
  expect(eq).toHaveBeenCalledWith("user_id", "student");
  expect(eq).toHaveBeenCalledWith("kind", "sprint");
  expect(is).toHaveBeenCalledWith("finished_at", null);
  expect(query.limit).toHaveBeenCalledWith(1);
  expect(
    screen.getByRole("link", { name: /Finish your last sprint/ }),
  ).toHaveAttribute("href", "/student/sprint/old-open");
});
it("loads topic names for recent sessions independently when progress fails", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [topic], error: null })),
  };
  mocks.from.mockReturnValue(query);
  render(
    await resolve(
      await HomeRecent({
        progress: Promise.resolve(null),
        sessions: Promise.resolve([session]),
      }),
    ),
  );
  expect(mocks.from).toHaveBeenCalledWith("topics");
  expect(screen.getByRole("link", { name: /Economic growth/ })).toBeVisible();
  expect(screen.queryByText(/economic-growth/)).not.toBeInTheDocument();
});
it("includes each stat's value in its accessible link name", async () => {
  render(
    await HomeStats({
      progress: Promise.resolve(progress()),
      due: Promise.resolve(7),
    }),
  );
  for (const name of [
    /Marks earned 3/,
    /Questions answered 3/,
    /Study time 0h 0m/,
    /Cards due 7/,
  ]) {
    expect(screen.getByRole("link", { name })).toBeVisible();
  }
});

import { HomeTopics, HomeLostMarks, HomeAverage } from "./sections";
it("shows sorted parent units, focuses the weakest, and ranks named dot points separately", async () => {
  const units = [
    { ...topic, id: "strong", name: "Strong unit", sort: 2, pct: 70 },
    { ...topic, id: "weak", name: "Weak unit", sort: 1, pct: 20 },
    {
      ...topic,
      id: "leaf",
      name: "Named dot point",
      parent_id: "strong",
      sort: 0,
      earned: 1,
      possible: 9,
      pct: 10,
    },
  ];
  const d = Promise.resolve(progress(units));
  render(await HomeTopics({ progress: d }));
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("Weak unit");
  expect(rows[0]).toHaveTextContent("Focus");
  expect(rows[0].querySelector('[role="meter"]')).toHaveAttribute(
    "aria-valuenow",
    "20",
  );
  expect(screen.queryByText("Named dot point")).toBeNull();
  cleanup();
  render(await HomeLostMarks({ progress: d }));
  expect(
    screen.getByRole("link", { name: /Named dot point8 marks/ }),
  ).toHaveAttribute("href", "/student/sprint?topics=strong&sub=leaf");
  expect(screen.queryByText("Strong unit")).toBeNull();
});
it("shows unstarted question types with working Try one links", async () => {
  render(
    await HomeAverage({
      progress: Promise.resolve(progress()),
      today: "2026-10-20",
    }),
  );
  expect(screen.getAllByText("Not started")).toHaveLength(3);
  expect(
    screen
      .getAllByRole("link", { name: "Try one" })
      .every((a) => a.getAttribute("href") === "/student/mark"),
  ).toBe(true);
  expect(
    screen.getByRole("img", { name: /Weekly practice average/ }),
  ).toBeVisible();
});

import { readHomeMarks } from "./sections";
it("reads only owned marked attempts in a bounded date range", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: [{ mark: 5, marked_at: "2026-10-20T00:00:00Z" }],
      error: null,
    }),
  };
  mocks.from.mockReturnValue(query);
  expect(await readHomeMarks("student", "2026-10-20")).toEqual({
    values: [0, 0, 0, 0, 0, 0, 5],
    delta: undefined,
  });
  expect(mocks.from).toHaveBeenCalledWith("attempts");
  expect(query.select).toHaveBeenCalledWith("mark,marked_at");
  expect(query.eq).toHaveBeenCalledWith("user_id", "student");
  expect(query.eq).toHaveBeenCalledWith("status", "marked");
  expect(query.gte).toHaveBeenCalledWith("marked_at", "2026-10-06T00:00:00Z");
  expect(query.lt).toHaveBeenCalledWith("marked_at", "2026-10-21T00:00:00Z");
});
it("counts fully known reviews only for the finished flashcard sessions in the recent five", async () => {
  const rows = [
    {
      ...session,
      id: "cards",
      kind: "flashcards",
      finished_at: "2026-10-20T00:00:00Z",
    },
  ];
  const reviews = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({
      data: [
        { session_id: "cards", mark: 1 },
        { session_id: "cards", mark: 0.5 },
        { session_id: "cards", mark: 0 },
      ],
    }),
  };
  const sessions = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows }),
  };
  mocks.from.mockImplementation((table) =>
    table === "sessions" ? sessions : reviews,
  );
  expect(await readHomeSessions("student")).toEqual([
    { ...rows[0], recall: { knew: 1, total: 3 } },
  ]);
  expect(reviews.eq).toHaveBeenCalledWith("user_id", "student");
  expect(reviews.in).toHaveBeenCalledWith("session_id", ["cards"]);
});
it("shows the completed sprint state and one-of-three plan from real completion data", async () => {
  render(
    await HomePlan({
      progress: Promise.resolve(progress()),
      today: "2026-10-20",
      sessions: Promise.resolve([
        {
          ...session,
          id: "done",
          finished_at: "2026-10-20T00:15:00Z",
          score: 6,
          max_score: 10,
        },
      ]),
      unfinished: Promise.resolve(session),
      due: Promise.resolve(16),
    }),
  );
  expect(screen.getByText("1 of 3")).toBeVisible();
  expect(screen.getByText("Sprint on Economic growth")).toBeVisible();
  expect(screen.getByText("Done at 11:15am · 60%")).toBeVisible();
});
it("renders real dated marks as a sparkline and comparison without replacing the RPC total", async () => {
  render(
    await HomeStats({
      progress: Promise.resolve(progress()),
      due: Promise.resolve(0),
      marks: Promise.resolve({ values: [0, 1, 0, 2, 0, 1, 4], delta: 5 }),
    }),
  );
  const marks = screen.getByRole("link", { name: /Marks earned 3/ });
  expect(marks).toHaveTextContent("+5vs previous 7 days");
  expect(screen.getByRole("img", { name: "Marks earned trend" })).toBeVisible();
});
it("omits the marks trend when dated attempts are unavailable", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi
      .fn()
      .mockResolvedValue({ data: [{ mark: 5, marked_at: null }], error: null }),
  };
  mocks.from.mockReturnValue(query);
  expect(await readHomeMarks("student", "2026-10-20")).toBeNull();
  render(
    await HomeStats({
      progress: Promise.resolve(progress()),
      due: Promise.resolve(0),
      marks: Promise.resolve(null),
    }),
  );
  expect(
    screen.queryByRole("img", { name: "Marks earned trend" }),
  ).not.toBeInTheDocument();
});
