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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { HomeRecent, readHomeSessions } from "./sections";

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

it("loads topic names for recent sessions independently when progress fails", async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [topic], error: null })),
  };
  mocks.from.mockReturnValue(query);
  render(
    await resolve(
      await HomeRecent({
        sessions: Promise.resolve([session]),
      }),
    ),
  );
  expect(mocks.from).toHaveBeenCalledWith("topics");
  expect(screen.getByRole("link", { name: /Economic growth/ })).toBeVisible();
  expect(screen.queryByText(/economic-growth/)).not.toBeInTheDocument();
});
import { HomeLostMarks } from "./sections";
it("ranks named dot points by dropped marks", async () => {
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
  render(await HomeLostMarks({ progress: d }));
  expect(
    screen.getByRole("link", { name: /Named dot point8 marks/ }),
  ).toHaveAttribute("href", "/student/sprint?topics=strong&sub=leaf");
  expect(screen.queryByText("Strong unit")).toBeNull();
});
it("counts fully known reviews only for the finished flashcard sessions in the recent three", async () => {
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
  expect(sessions.limit).toHaveBeenCalledWith(3);
  expect(sessions.eq).toHaveBeenCalledWith("user_id", "student");
  expect(reviews.eq).toHaveBeenCalledWith("user_id", "student");
  expect(reviews.in).toHaveBeenCalledWith("session_id", ["cards"]);
});

import { HomeNextStep, HomeWeek } from "./sections";
it("uses the existing topic URL contract and explains actual lost marks", async () => {
  render(
    await HomeNextStep({
      progress: Promise.resolve(progress()),
      sessions: Promise.resolve([session]),
    }),
  );
  expect(
    screen.getByRole("heading", { name: /A sprint on Economic growth/ }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /lowest topic at 30%, with 7 marks dropped in the last 30 days/,
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /Start sprint/ })).toHaveAttribute(
    "href",
    "/student/sprint?topics=economic-growth",
  );
});
it("keeps the sprint actions and offers retry when progress is unavailable", async () => {
  render(
    await HomeNextStep({
      progress: Promise.resolve(null),
      sessions: Promise.resolve([]),
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Pick a topic for today's sprint" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /Start sprint/ })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  expect(
    screen.queryByRole("link", { name: "Choose another topic" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load your recommendation.",
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(screen.queryByText("Start your first Topic Sprint")).toBeNull();
});
it.each([{ sessions: [session] }, { sessions: [] }, { sessions: null }])(
  "distinguishes unfinished unmarked sprint, first visit and failed sessions (%j)",
  async ({ sessions }) => {
    render(
      await HomeNextStep({
        progress: Promise.resolve(progress([])),
        sessions: Promise.resolve(sessions),
      }),
    );
    expect(
      screen.getByRole("heading", {
        name:
          sessions?.length === 0
            ? "Start your first Topic Sprint"
            : "Pick a topic for today's sprint",
      }),
    ).toBeVisible();
    if (sessions?.length)
      expect(
        screen.getByText(/Answer a few more marked questions/),
      ).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(
      screen.queryByRole("link", { name: "Choose another topic" }),
    ).toBeNull();
    if (sessions === null) expect(screen.getByRole("alert")).toBeVisible();
  },
);
it("uses loaded sparse marked progress without treating it as a first visit", async () => {
  render(
    await HomeNextStep({
      progress: Promise.resolve(progress([{ ...topic, answered: 1 }])),
      sessions: Promise.resolve([session]),
    }),
  );
  expect(screen.getByText(/Answer a few more marked questions/)).toBeVisible();
});
it("shows retry instead of empty-average copy when progress fails", async () => {
  render(
    await HomeWeek({
      today: "2026-10-23",
      activity: Promise.resolve([]),
      progress: Promise.resolve(null),
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load your practice average.",
  );
  expect(screen.queryByText(/No marked answers/)).toBeNull();
});
it("shows weekly activity from cards as well as questions, and an honest marks-only average", async () => {
  render(
    await HomeWeek({
      today: "2026-10-23",
      activity: Promise.resolve([
        { day: "2026-10-19", questions: 0, cards: 2 },
      ]),
      progress: Promise.resolve(progress()),
    }),
  );
  expect(screen.getByText("1 of 5")).toBeVisible();
  expect(screen.getByLabelText("Mon: practised")).toBeVisible();
  expect(screen.getByLabelText("Fri: no practice")).toHaveAttribute(
    "aria-current",
    "date",
  );
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "30");
});
it("preserves mark states, unfinished routes, and recall without inventing a mark", async () => {
  mocks.from.mockReturnValue({
    select: () => ({ order: async () => ({ data: [topic] }) }),
  });
  render(
    await HomeRecent({
      today: "2026-10-01",
      sessions: Promise.resolve([
        {
          ...session,
          id: "earned",
          finished_at: "2026-10-01T01:00:00Z",
          score: 8,
          max_score: 10,
        },
        {
          ...session,
          id: "part",
          finished_at: "2026-10-01T01:00:00Z",
          score: 5,
          max_score: 10,
        },
        {
          ...session,
          id: "miss",
          finished_at: "2026-10-01T01:00:00Z",
          score: 2,
          max_score: 10,
        },
        {
          ...session,
          id: "recall",
          kind: "flashcards",
          finished_at: "2026-10-01T01:00:00Z",
          recall: { knew: 2, total: 3 },
        },
        session,
      ]),
    }),
  );
  for (const label of ["Earned", "Missed", "Continue", "knew"])
    expect(screen.getByText(label)).toBeVisible();
  expect(screen.getAllByText("Partly there")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /2\/3knew/ })).toHaveAttribute(
    "href",
    "/student/flashcards/recall",
  );
  expect(screen.getByRole("link", { name: /Continue/ })).toHaveAttribute(
    "href",
    "/student/sprint/old-open",
  );
});
