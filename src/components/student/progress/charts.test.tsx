import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProgressChart, weeklyScores } from "./charts";
import type { HistoryScore } from "@/lib/progress";
afterEach(cleanup);
const history: HistoryScore[] = [
  {
    id: "a",
    kind: "sprint",
    config: {},
    finished_at: "2026-10-05T01:00:00Z",
    elapsed_s: 10,
    pct: 40,
    by_type: {},
  },
  {
    id: "b",
    kind: "single",
    config: {},
    finished_at: "2026-10-06T01:00:00Z",
    elapsed_s: 10,
    pct: 80,
    by_type: {},
  },
  {
    id: "c",
    kind: "sprint",
    config: {},
    finished_at: "2026-10-12T01:00:00Z",
    elapsed_s: 10,
    pct: 90,
    by_type: {},
  },
  {
    id: "d",
    kind: "sprint",
    config: {},
    finished_at: "",
    elapsed_s: 0,
    pct: 100,
    by_type: {},
  },
];
it("averages only finished scored sessions into Sydney Monday weeks", () => {
  expect(weeklyScores(history)).toEqual([
    { day: "2026-10-05", value: 60 },
    { day: "2026-10-12", value: 90 },
  ]);
});
it("offers chart data and canonical session reports", () => {
  render(<ProgressChart history={history} />);
  fireEvent.click(screen.getByRole("button", { name: "Show chart data" }));
  expect(screen.getByRole("table")).toHaveTextContent("60%");
  expect(screen.getByRole("link", { name: /80%/ })).toHaveAttribute(
    "href",
    "/student/activity/b",
  );
});
it("sums actual questions by week and handles empty history", () => {
  render(
    <ProgressChart
      volume
      history={[]}
      days={[
        { day: "2026-10-05", questions: 4, cards: 99 },
        { day: "2026-10-06", questions: 7, cards: 99 },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show chart data" }));
  expect(screen.getByRole("table")).toHaveTextContent("11");
  cleanup();
  render(<ProgressChart history={[]} />);
  expect(screen.getByText("No activity in this range")).toBeVisible();
});
