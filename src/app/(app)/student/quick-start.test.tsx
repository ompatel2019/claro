import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

it("shows the term, quote and two large study destinations", async () => {
  render(await resolve(await Home()));
  const hero = screen.getByRole("region", { name: "Your study week" });
  expect(within(hero).getByText("Term 4 · Week 2")).toBeVisible();
  expect(within(hero).getByTitle("Term 4, week 2 of 10")).toBeVisible();
  const launches = screen.getByRole("region", { name: "Quick start" });
  expect(within(launches).getAllByRole("link")).toHaveLength(2);
  for (const [name, href] of [
    ["Topic Sprint", "/student/sprint"],
    ["Flashcards", "/student/flashcards"],
  ]) {
    expect(
      within(launches).getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("href", href);
  }
  for (const name of [
    "Marks earned",
    "Questions answered",
    "Study time",
    "Cards due",
    "Practice average",
    "Today's plan",
    "Topics",
    "Where your marks go",
    "Ask Claro",
  ]) {
    expect(screen.queryByRole("heading", { name })).toBeNull();
  }
  expect(screen.getByText(studyQuote("2026-10-19"))).toBeVisible();
});
import { studyQuote } from "@/lib/home";

it("shows streak numbers, a heatmap with today marked and reads a year of activity", async () => {
  render(await resolve(await Home()));
  for (const [label, value] of [
    ["Day streak", "2"],
    ["Longest streak", "5"],
    ["Days studied", "1"],
  ])
    expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
  expect(mocks.calls).toContainEqual([
    "activity_days",
    { p_from: "2025-10-13", p_to: "2026-10-19" },
  ]);
  const today = screen.getByRole("link", { name: /^Mon 19 Oct 2026/ });
  expect(today).toHaveAttribute("aria-current", "date");
  expect(today).toHaveAttribute("href", "/student/activity?date=2026-10-19");
  expect(screen.getByText("Today is lit")).toBeInTheDocument();
});

it("offers a choice on an unlit day before opening any setup", async () => {
  mocks.studiedToday = false;
  render(await resolve(await Home()));
  fireEvent.click(screen.getByRole("button", { name: "Light up today" }));
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("link", { name: /Topic Sprint/ }),
  ).toHaveAttribute("href", "/student/sprint");
  expect(
    within(dialog).getByRole("link", { name: /Flashcards/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(within(dialog).getByText(/Due for review means/)).toBeVisible();
});

it("keeps both actions usable when activity and topic reads fail", async () => {
  mocks.failActivity = true;
  mocks.failTopics = true;
  render(await resolve(await Home()));
  expect(screen.getByRole("link", { name: /^Flashcards/ })).toHaveAttribute(
    "href",
    "/student/flashcards",
  );
  expect(screen.getByRole("link", { name: /^Topic Sprint/ })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
    "Couldn't load your study days.Try again",
  ]);
});

it("isolates a recent-session failure while keeping study actions usable", async () => {
  mocks.failSessions = true;
  render(await resolve(await Home()));
  expect(screen.getByText("Couldn't load your recent sessions.")).toBeVisible();
  expect(screen.getByRole("region", { name: "Quick start" })).toBeVisible();
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
      name: /Mixed sprint.*The Global Economy.*In progress/,
    }),
  ).toHaveAttribute("href", "/student/sprint/resume");
});
