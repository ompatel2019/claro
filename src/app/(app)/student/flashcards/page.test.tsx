import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DeckCard } from "@/lib/deck";
import type { FlashcardProgress } from "@/lib/flashcards";

const fixtures = vi.hoisted(() => ({
  cards: [] as DeckCard[],
  progress: [] as FlashcardProgress[],
  own: 0,
  open: false,
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: vi.fn(async () => ({ id: "student" })),
}));
vi.mock("@/lib/flashcard-data", () => ({
  loadDeckBank: vi.fn(async () => ({
    cards: fixtures.cards,
    progress: fixtures.progress,
  })),
}));
vi.mock("@/lib/flashcards", async (original) => ({
  ...(await original<typeof import("@/lib/flashcards")>()),
  sydneyToday: () => "2026-10-20",
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const result =
        table === "topics"
          ? {
              data: [
                { id: "t1", parent_id: null, name: "Global Economy", sort: 1 },
              ],
            }
          : table === "flashcards"
            ? { count: fixtures.own }
            : table === "sessions"
              ? {
                  data: fixtures.open
                    ? [{ id: "unfinished", config: { card_ids: ["a", "b"] } }]
                    : [],
                }
              : { data: [{ flashcard_id: "a" }, { flashcard_id: "a" }] };
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        is: () => query,
        limit: () => query,
        throwOnError: async () => result,
      };
      return query;
    },
  }),
}));
vi.mock("@/components/flashcard-builder", () => ({
  FlashcardBuilder: () => <div>Deck builder</div>,
}));
vi.mock("@/components/flashcard-start", () => ({
  FlashcardStart: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock("@/components/student/flashcards/new-card", () => ({
  NewCard: ({ label = "New card" }: { label?: string }) => (
    <button>{label}</button>
  ),
}));
import Flashcards from "./page";

beforeEach(() => {
  fixtures.cards = [];
  fixtures.progress = [];
  fixtures.own = 0;
  fixtures.open = false;
});
afterEach(cleanup);

it("renders honest empty counts and the personal-card creation entry point", async () => {
  render(await Flashcards({ searchParams: Promise.resolve({}) }));
  expect(
    screen.getByText("Nothing due. Start a deck below."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Review due cards" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "New 0, Learning 0, Known 0" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "My cards (0)" })).toHaveAttribute(
    "href",
    "/student/flashcards/mine",
  );
  expect(
    screen.getByRole("button", { name: "Make your first card" }),
  ).toBeInTheDocument();
});

it("derives the due-topic meter, library states and deduplicated unfinished reviews from loaded data", async () => {
  fixtures.cards = [
    { id: "a", topic_id: "t1-trade", kind: "term", owner_id: null },
    { id: "b", topic_id: "t1-trade", kind: "stat", owner_id: "student" },
    { id: "c", topic_id: "t1-trade", kind: "term", owner_id: null },
  ];
  fixtures.progress = [
    {
      flashcard_id: "a",
      reviews: 2,
      last_mark: 0.5,
      due_on: "2026-10-20",
      interval_days: 1,
      updated_at: "2026-10-19",
    },
    {
      flashcard_id: "b",
      reviews: 3,
      last_mark: 1,
      due_on: "2026-10-21",
      interval_days: 3,
      updated_at: "2026-10-19",
    },
    // Progress for a card no longer in the bank must not affect counts.
    {
      flashcard_id: "removed",
      reviews: 1,
      last_mark: 1,
      due_on: "2026-10-21",
      interval_days: 3,
      updated_at: "2026-10-19",
    },
  ];
  fixtures.own = 1;
  fixtures.open = true;
  render(await Flashcards({ searchParams: Promise.resolve({ topic: "t1" }) }));
  expect(
    screen.getByText("2 Claro cards and 1 of your own"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "New 1, Learning 1, Known 1" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("meter", { name: "Global Economy: 1 due" }),
  ).toHaveAttribute("aria-valuenow", "100");
  expect(
    screen.getByText("About 1 minute · 1 due tomorrow"),
  ).toBeInTheDocument();
  const resume = screen.getByText("Unfinished session").parentElement!;
  expect(within(resume).getByText(/1 of 2 reviewed/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
    "href",
    "/student/flashcards/unfinished",
  );
  expect(screen.getByRole("link", { name: "Manage my cards" })).toHaveAttribute(
    "href",
    "/student/flashcards/mine",
  );
  expect(
    screen.queryByRole("button", { name: "Make your first card" }),
  ).not.toBeInTheDocument();
});
