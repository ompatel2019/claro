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
vi.mock("@/lib/progress-data", () => ({
  loadProgress: async () => ({ topics: [] }),
}));
vi.mock("@/app/(app)/actions", () => ({ startSprint: vi.fn() }));
vi.mock("@/app/(app)/flashcards/actions", () => ({
  startFlashcards: vi.fn(),
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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.unfinished = [];
  mocks.due = 0;
  mocks.dueError = false;
  mocks.sessionError = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "always puts launch boxes before stats with unfinished sessions: %s",
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
    const launches = screen.getByRole("region", { name: "Quick start" });
    expect(
      screen.getByRole("heading", { level: 1 }).parentElement?.parentElement
        ?.nextElementSibling,
    ).toBe(launches);
    expect(
      within(launches)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Topic Sprint", "Flashcards"]);
    expect(
      within(launches).getByRole("button", {
        name: "20 MC questions · 20 min",
      }),
    ).toBeVisible();
    expect(
      within(launches).getByRole("button", {
        name: "5 short answers · about 23 min",
      }),
    ).toBeVisible();
    expect(
      within(launches).getByRole("link", { name: "Start sprint" }),
    ).toHaveAttribute("href", "/student/sprint");
    expect(
      within(launches).getByRole("link", { name: "Choose a deck" }),
    ).toHaveAttribute("href", "/student/flashcards");
    expect(within(launches).getByText("0 due")).toBeVisible();
    let previous: Element = launches;
    for (const title of [
      "Questions this week",
      "Activity",
      "Score trend",
      "Recent activity",
      ...(unfinished ? ["Continue where you left off"] : []),
      "Weak topics",
    ]) {
      const section = screen.getByText(title, { exact: true });
      expect(
        previous.compareDocumentPosition(section) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      previous = section;
    }
    if (unfinished)
      expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
        "href",
        "/student/sprint/resume",
      );
  },
);

it("shows the due count and retains the direct review action", async () => {
  mocks.due = 7;
  render(await resolve(await Home()));
  const launches = screen.getByRole("region", { name: "Quick start" });
  expect(
    within(launches).getByRole("button", { name: "Flashcards · 7 due" }),
  ).toBeVisible();
  expect(launches.querySelector('input[name="due"]')).toHaveValue("1");
});

it("keeps launches available when due counts and unfinished sessions fail", async () => {
  mocks.dueError = true;
  mocks.sessionError = true;
  render(await resolve(await Home()));
  const launches = screen.getByRole("region", { name: "Quick start" });
  expect(
    within(launches).getByRole("button", { name: "20 MC questions · 20 min" }),
  ).toBeVisible();
  expect(
    within(launches).getByRole("link", { name: "Choose a deck" }),
  ).toBeVisible();
  expect(within(launches).getByRole("alert")).toHaveTextContent(
    "Couldn't load your due flashcards",
  );
  expect(within(launches).queryByText("0 due")).toBeNull();
  expect(
    screen.getByText("Couldn't load your unfinished sessions."),
  ).toBeVisible();
});
