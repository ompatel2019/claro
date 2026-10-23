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
