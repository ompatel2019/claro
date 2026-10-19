import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "@/test/resolve-server-components";
import Home from "./page";

const mocks = vi.hoisted(() => ({
  due: 0 as number | null,
  failActivity: false,
  failTopics: false,
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
          : { count: mocks.due, error: mocks.due === null };
      const query = {
        select: () => query,
        eq: () => query,
        lte: () => query,
        order: () => query,
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
  ).toEqual(["Topic Sprint", "Flashcards", "Mark my answer", "Activity"]);
  for (const [name, href] of [
    ["Topic Sprint", "/student/sprint"],
    ["Flashcards 0 due", "/student/flashcards"],
    ["Mark my answer", "/student/mark"],
    ["Activity", "/student/activity"],
  ])
    expect(
      within(launches).getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("href", href);
  expect(
    hero.compareDocumentPosition(launches) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Your study days" }),
  ).toBeVisible();
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
  expect(screen.getByRole("link", { name: /^Flashcards 7 due/ })).toBeVisible();
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
    screen.getByRole("link", { name: /^Flashcards Choose a deck/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
    "Couldn't load your topics.Try again",
    "Couldn't load your study days.Try again",
  ]);
});
