import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "@/test/resolve-server-components";
import Home from "./page";
import type { Session } from "@/lib/practice";
import type { ProgressData } from "@/lib/progress";

const mocks = vi.hoisted(() => ({
  due: 0 as number | null,
  failActivity: false,
  failTopics: false,
  progress: null as ProgressData | null,
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
vi.mock("@/components/flashcard-start", () => ({
  FlashcardStart: ({ label }: { label: string }) => (
    <button type="submit">{label}</button>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/flashcards", () => ({ sydneyToday: () => "2026-10-19" }));
const topics = [
  { id: "t1", parent_id: null, name: "The Global Economy", sort: 1 },
  { id: "t1-trade", parent_id: "t1", name: "Trade", sort: 2 },
  { id: "t2", parent_id: null, name: "Economic Issues", sort: 3 },
];
vi.mock("@/lib/progress-data", () => ({
  loadProgress: async () => {
    if (!mocks.progress) throw new Error("Unavailable");
    return mocks.progress;
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    rpc: (name: string, args?: unknown) => {
      mocks.calls.push([name, args]);
      const error = mocks.failActivity ? new Error(name) : null;
      return Object.assign(
        Promise.resolve({
          data: [{ day: "2026-10-19", questions: 4, cards: 2 }],
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
            : { count: mocks.due, error: mocks.due === null };
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
  mocks.due = 0;
  mocks.progress = null;
  mocks.failSessions = false;
  mocks.sessions = [];
  mocks.failActivity = false;
  mocks.failTopics = false;
  mocks.calls = [];
});
afterEach(cleanup);

it("shows the compact term indicator, launch cards, study days and study hub", async () => {
  render(await resolve(await Home()));
  const hero = screen.getByRole("region", { name: "Your study week" });
  expect(within(hero).getByText("Term 4 · Week 2")).toBeVisible();
  expect(within(hero).getByTitle("Term 4, week 2 of 10")).toBeVisible();
  const launches = screen.getByRole("region", { name: "Quick start" });
  expect(
    within(launches)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent),
  ).toEqual(["Marks earned", "Questions answered", "Study time", "Cards due"]);
  for (const [name, href] of [
    ["Questions answered Unavailable", "/student/sprint"],
    ["Cards due 0", "/student/flashcards"],
    ["Study time Unavailable", "/student/activity"],
  ])
    expect(
      within(launches).getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("href", href);
  expect(
    hero.compareDocumentPosition(launches) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Study days" })).toBeVisible();
  expect(screen.queryByText(/Continue where you left off/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Continue" })).toBeNull();
});

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
  expect(screen.getByText("Today")).toBeInTheDocument();
});

it("lights up today with a sprint, or due flashcards in one click", async () => {
  render(await resolve(await Home()));
  expect(screen.getByRole("link", { name: "Light up today" })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  cleanup();
  mocks.due = 7;
  render(await resolve(await Home()));
  expect(screen.getByRole("button", { name: "Light up today" })).toBeVisible();
  expect(screen.getByRole("link", { name: /^Cards due 7/ })).toBeVisible();
});

it("lists only top-level topics in the study hub, each opening its sprint", async () => {
  render(await resolve(await Home()));
  const hub = screen.getByRole("region", { name: "Study hub" });
  const links = within(hub)
    .getAllByRole("listitem")
    .map((li) => li.firstChild);
  expect(links.map((l) => l?.textContent)).toEqual([
    "1The Global EconomyPractise",
    "2Economic IssuesPractise",
  ]);
  expect(links[0]).toHaveAttribute("href", "/student/sprint?topics=t1");
  expect(links[1]).toHaveAttribute("href", "/student/sprint?topics=t2");
});

it("keeps launches usable when due, activity and topic reads fail", async () => {
  mocks.due = null;
  mocks.failActivity = true;
  mocks.failTopics = true;
  render(await resolve(await Home()));
  expect(
    screen.getByRole("link", { name: /^Cards due Unavailable/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
    "Couldn't load your practice average.Try again",
    "Couldn't load your topics.Try again",
    "Couldn't load your study days.Try again",
    "Couldn't load your dropped marks.Try again",
  ]);
});

it("uses real progress totals, per-type marks, topic history and leaf-only lost marks", async () => {
  mocks.progress = {
    topics: [
      {
        ...topics[0],
        answered: 10,
        earned: 12,
        possible: 20,
        pct: 60,
        last_answered: "2026-10-18",
      },
      {
        ...topics[1],
        answered: 10,
        earned: 12,
        possible: 20,
        pct: 60,
        last_answered: "2026-10-18",
      },
    ],
    types: [{ id: "mcq", answered: 10, pct: 60 }],
    history: [
      {
        id: "s1",
        kind: "sprint",
        config: {},
        finished_at: "2026-10-18T00:00:00Z",
        elapsed_s: 600,
        pct: 60,
        by_type: {},
      },
    ],
    verbs: [],
    mastery: [],
    missed: [],
    due: [],
  };
  render(await resolve(await Home()));
  const stats = screen.getByRole("region", { name: "Quick start" });
  expect(within(stats).getByText("12")).toBeVisible();
  expect(within(stats).getByText("10")).toBeVisible();
  expect(within(stats).getByText("0h 10m")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Practice average" }),
  ).toBeVisible();
  expect(screen.getByText("8 marks")).toBeVisible();
  expect(screen.getByText(/10 answered · last practised/)).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /Practise The Global Economy/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/vs previous/)).toBeNull();
  expect(screen.getByText("Consistency is the cheat code.")).toBeVisible();
});

it("isolates a recent-session failure while keeping due cards and topics usable", async () => {
  mocks.failSessions = true;
  mocks.due = 7;
  render(await resolve(await Home()));
  expect(screen.getByText("Couldn't load your recent sessions.")).toBeVisible();
  expect(
    screen.getByRole("link", { name: /Review 7 due cards/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(screen.getByRole("region", { name: "Study hub" })).toBeVisible();
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
    screen.getByRole("link", { name: /Finish your last sprint/ }),
  ).toHaveAttribute("href", "/student/sprint/resume");
  expect(
    screen.getByRole("link", { name: /Mixed sprint.*In progress/ }),
  ).toHaveAttribute("href", "/student/sprint/resume");
});
