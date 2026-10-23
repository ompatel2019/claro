import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "@/test/resolve-server-components";
import Home from "./page";
import type { Session } from "@/lib/practice";

const mocks = vi.hoisted(() => ({
  studiedToday: true,
  failActivity: false,
  failTopics: false,
  failSessions: false,
  sessions: [] as Session[],
  calls: [] as unknown[][],
}));
vi.mock("@/lib/progress-data", () => ({ loadProgress: async () => null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({
    id: "student",
    full_name: "Test Student",
    role: "student",
    year_level: 12,
  }),
}));
vi.mock("@/components/welcome-dialog", () => ({ WelcomeDialog: () => null }));
vi.mock("@/components/shortcut", () => ({ Shortcut: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/flashcards", () => ({ sydneyToday: () => "2026-10-19" }));
const topics = [
  { id: "t1", parent_id: null, name: "The Global Economy", sort: 1 },
  { id: "t1-trade", parent_id: "t1", name: "Trade", sort: 2 },
  { id: "t2", parent_id: null, name: "Economic Issues", sort: 3 },
];
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    rpc: (name: string, args?: unknown) => {
      mocks.calls.push([name, args]);
      const error = mocks.failActivity ? new Error(name) : null;
      return Object.assign(
        Promise.resolve({
          data: mocks.studiedToday
            ? [{ day: "2026-10-19", questions: 4, cards: 2 }]
            : [],
          error,
        }),
        {
          single: async () => ({
            data: { current_streak: 2, longest_streak: 5 },
            error,
          }),
        },
      );
    },
    from: (table: string) => {
      const result =
        table === "topics"
          ? { data: mocks.failTopics ? null : topics, error: mocks.failTopics }
          : table === "sessions"
            ? { data: mocks.sessions, error: mocks.failSessions }
            : { count: 0, error: null };
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({
          data:
            mocks.sessions.find((s) => s.kind === "sprint" && !s.finished_at) ??
            null,
          error: mocks.failSessions,
        }),
        lte: () => query,
        order: () => query,
        in: () => query,
        limit: () => query,
        then: (done: (r: unknown) => unknown) =>
          Promise.resolve(result).then(done),
      };
      return query;
    },
  }),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
beforeEach(() => {
  mocks.studiedToday = true;
  mocks.failSessions = false;
  mocks.sessions = [];
  mocks.failActivity = false;
  mocks.failTopics = false;
  mocks.calls = [];
});
afterEach(cleanup);

it("shows term context, one next step, honest weekly practice and a quiet flashcard link", async () => {
  render(await resolve(await Home()));
  expect(screen.getByText(/Term 4, week 2/)).toBeVisible();
  const next = screen.getByRole("region", {
    name: "Start your first Topic Sprint",
  });
  expect(
    within(next).getByRole("link", { name: /Start sprint/ }),
  ).toHaveAttribute("href", "/student/sprint");
  expect(
    within(next).getByRole("link", { name: /Flashcards/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(screen.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(screen.getByText("1 of 5")).toBeVisible();
  expect(screen.getByLabelText("Mon: practised")).toHaveAttribute(
    "aria-current",
    "date",
  );
  expect(mocks.calls).toContainEqual([
    "activity_days",
    { p_from: "2026-10-19", p_to: "2026-10-19" },
  ]);
});
it("keeps next-step actions usable when progress and activity fail", async () => {
  mocks.failActivity = true;
  mocks.failTopics = true;
  render(await resolve(await Home()));
  expect(screen.getByRole("link", { name: /^Start sprint/ })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  expect(screen.getByText("Practice days unavailable")).toBeVisible();
});
it("isolates recent-session failures", async () => {
  mocks.failSessions = true;
  render(await resolve(await Home()));
  expect(screen.getByText("Couldn't load your recent sessions.")).toBeVisible();
  expect(screen.getByRole("link", { name: /^Start sprint/ })).toBeVisible();
});

it("links recent and unfinished sessions to their existing runner routes", async () => {
  mocks.sessions = [
    {
      id: "resume",
      kind: "sprint",
      config: { mode: "mixed", topics: ["t1"] },
      started_at: "2026-10-19T00:00:00Z",
      finished_at: null,
      score: null,
      max_score: null,
      elapsed_s: 30,
      user_id: "student",
      summary: null,
    },
  ];
  render(await resolve(await Home()));
  expect(
    screen.getByRole("link", {
      name: /Mixed sprint.*Continue.*The Global Economy/,
    }),
  ).toHaveAttribute("href", "/student/sprint/resume");
});
