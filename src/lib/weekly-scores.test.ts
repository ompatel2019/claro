import { expect, it } from "vitest";
import { weeklyScores, type HistoryScore } from "./progress";

const row = (
  finished_at: string,
  pct: number | null,
  kind = "sprint",
): HistoryScore => ({
  id: finished_at,
  kind,
  config: {},
  finished_at,
  pct,
  elapsed_s: 60,
  by_type: {},
});

it("keeps sorted Monday averages across Sydney DST transitions", () => {
  const history = [
    row("2026-10-04T13:00:00Z", 90), // Monday after spring transition
    row("2026-04-05T14:00:00Z", 80), // Monday after autumn transition
    row("2026-10-03T15:59:59Z", 20),
    row("2026-10-03T16:00:00Z", 40),
    row("2026-04-04T15:59:59Z", 30),
    row("2026-04-04T16:00:00Z", 50),
    row("2026-10-04T12:59:59Z", 60, "single"), // Sunday in Sydney
    row("2026-10-04T14:00:00Z", 10, "flashcards"),
    row("invalid", 100),
    row("", 100),
    ...[null, NaN, Infinity, -Infinity].map((pct) =>
      row("2026-10-05T00:00:00Z", pct),
    ),
  ];
  expect(weeklyScores(history)).toEqual([
    { day: "2026-03-30", value: 40 },
    { day: "2026-04-06", value: 80 },
    { day: "2026-09-28", value: 40 },
    { day: "2026-10-05", value: 50 },
  ]);
  expect(weeklyScores(history, "2026-10-04", "2026-10-04")).toEqual([
    { day: "2026-09-28", value: 40 },
  ]);
  expect(weeklyScores(history, "2026-10-05", "2026-10-04")).toEqual([]);
  expect(weeklyScores([])).toEqual([]);
});

it("keeps fractional and unclamped scores with no invented empty weeks", () => {
  const history = [
    row("2027-01-04T00:00:00Z", 101),
    row("2026-12-27T13:00:00Z", -1),
    row("2027-01-01T00:00:00Z", 2),
  ];
  expect(weeklyScores(history)).toEqual([
    { day: "2026-12-28", value: 0.5 },
    { day: "2027-01-04", value: 101 },
  ]);
  expect(weeklyScores(history, null, "2027-01-01")).toEqual([
    { day: "2026-12-28", value: 0.5 },
  ]);
});
