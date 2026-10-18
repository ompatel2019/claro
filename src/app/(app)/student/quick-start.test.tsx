import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "@/test/resolve-server-components";
import Home from "./page";

const mocks = vi.hoisted(() => ({
  unfinished: [] as object[],
  due: 0,
  dueError: false,
  sessionError: false,
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
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    rpc: (name: string) => ({
      data: [],
      error: null,
      single: async () => ({
        data:
          name === "activity_streaks"
            ? { current_streak: 0, longest_streak: 0 }
            : null,
        error: null,
      }),
    }),
    from: (table: string) => {
      const query = {
        data: [] as object[],
        count: table === "flashcard_progress" ? mocks.due : 0,
        error:
          table === "flashcard_progress" && mocks.dueError
            ? new Error("due")
            : null,
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        lte: () => query,
        gt: () => {
          query.count = 0;
          return query;
        },
        not: () => query,
        is: () => {
          query.data = mocks.unfinished;
          query.error = mocks.sessionError ? new Error("sessions") : null;
          return query;
        },
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  mocks.unfinished = [];
  mocks.due = 0;
  mocks.dueError = false;
  mocks.sessionError = false;
});
afterEach(() => {
  cleanup();
});

it.each([false, true])(
  "keeps the four tiles between the banner and streak with unfinished history: %s",
  async (unfinished) => {
    if (unfinished)
      mocks.unfinished = [
        {
          id: "resume",
          kind: "sprint",
          config: { mode: "mcq" },
          elapsed_s: 0,
          started_at: new Date().toISOString(),
          attempts: [],
          flashcard_reviews: [],
        },
      ];
    render(await resolve(await Home()));
    const banner = screen.getByRole("region", { name: "Your study week" });
    const launches = screen.getByRole("region", { name: "Quick start" });
    expect(banner.nextElementSibling).toBe(launches);
    expect(
      within(launches)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Topic Sprint", "Flashcards", "Mark my answer", "Activity"]);
    expect(within(launches).getAllByRole("link")).toHaveLength(4);
    expect(
      within(launches).getByRole("link", { name: /Topic Sprint/ }),
    ).toHaveAttribute("href", "/student/sprint");
    expect(
      within(launches).getByRole("link", { name: /Flashcards 0 due/ }),
    ).toHaveAttribute("href", "/student/flashcards");
    const streak = screen.getByText("Longest 0 days");
    expect(
      launches.compareDocumentPosition(streak) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const name of [
      "Score trend",
      "Recent activity",
      "Weak topics",
      "Questions this week",
    ])
      expect(screen.queryByText(name, { exact: true })).toBeNull();
    const resume = screen.queryByRole("link", { name: "Continue" });
    if (unfinished)
      expect(resume).toHaveAttribute("href", "/student/sprint/resume");
    else expect(resume).toBeNull();
  },
);
it("shows the due count inside the linked flashcards tile", async () => {
  mocks.due = 7;
  render(await resolve(await Home()));
  const launches = screen.getByRole("region", { name: "Quick start" });
  expect(
    within(launches).getByRole("link", { name: /Flashcards 7 due/ }),
  ).toHaveAttribute("href", "/student/flashcards");
});
it("keeps launches available when due counts and unfinished sessions fail", async () => {
  mocks.dueError = true;
  mocks.sessionError = true;
  render(await resolve(await Home()));
  const launches = screen.getByRole("region", { name: "Quick start" });
  expect(
    within(launches).getByRole("link", { name: /Topic Sprint/ }),
  ).toBeVisible();
  expect(
    within(launches).getByRole("link", { name: /Flashcards Choose a deck/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(within(launches).queryByText("0 due")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load your unfinished sessions.",
  );
});
