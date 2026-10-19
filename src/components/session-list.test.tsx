import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Session } from "@/lib/practice";
import { SessionList } from "./session-list";
afterEach(cleanup);
it("routes pending and finished singles to their own report and avoids a null score", () => {
  const sessions = [null, "2026-10-09T01:00:00Z"].map((finished_at, i) => ({
    id: `s${i}`,
    kind: "single",
    user_id: "u",
    config: {},
    started_at: "2026-10-09T01:00:00Z",
    finished_at,
    score: null,
    max_score: null,
    elapsed_s: 0,
    summary: null,
  })) as Session[];
  render(<SessionList sessions={sessions} topics={[]} />);
  const links = screen.getAllByRole("link");
  expect(links[0]).toHaveAttribute("href", "/student/activity/s0");
  expect(links[1]).toHaveAttribute("href", "/student/activity/s1");
  expect(screen.getByText("In progress")).toBeVisible();
  expect(screen.queryByText(/null/)).toBeNull();
});

it("shows supported sprint and flashcard sessions while ignoring old paper rows", () => {
  const base = {
    user_id: "u",
    config: { mode: "mcq" },
    started_at: "2026-10-09T01:00:00Z",
    finished_at: null,
    score: null,
    max_score: null,
    elapsed_s: 0,
    summary: null,
  };
  render(
    <SessionList
      sessions={
        [
          { ...base, id: "s", kind: "sprint" },
          { ...base, id: "c", kind: "flashcards" },
          { ...base, id: "p", kind: "paper" },
        ] as Session[]
      }
      topics={[]}
    />,
  );
  expect(
    screen.getAllByRole("link").map((link) => link.getAttribute("href")),
  ).toEqual(["/student/sprint/s", "/student/flashcards/c"]);
});
it("shows actual fully known review counts on home while preserving the default score display", () => {
  const sessions = [
    {
      id: "cards",
      kind: "flashcards",
      user_id: "u",
      config: { mode: "study", topics: [] },
      started_at: "2026-10-20T00:00:00Z",
      finished_at: "2026-10-20T01:00:00Z",
      score: 19,
      max_score: 20,
      elapsed_s: 60,
      summary: null,
      recall: { knew: 18, total: 20 },
    },
  ] as unknown as (Session & { recall: { knew: number; total: number } })[];
  const { rerender } = render(
    <SessionList home sessions={sessions} topics={[]} />,
  );
  expect(screen.getByText("18/20")).toBeVisible();
  expect(screen.getByText("knew")).toBeVisible();
  rerender(<SessionList sessions={sessions} topics={[]} />);
  expect(screen.queryByText("18/20")).toBeNull();
});
