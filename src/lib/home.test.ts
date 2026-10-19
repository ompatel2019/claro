import { describe, expect, it } from "vitest";
import { continueTime, greeting, longDate, schoolWeek } from "./home";

describe("home", () => {
  it("greets by Sydney time of day", () => {
    // 9 Oct 2026: Sydney is UTC+11.
    expect(greeting(new Date("2026-10-08T22:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-09T02:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-09T07:00:00Z"))).toBe("Good evening");
  });
  it("formats the eyebrow date", () => {
    expect(longDate(new Date("2026-10-08T22:00:00Z"))).toBe("Friday 9 October");
  });
});

describe("continueTime", () => {
  const now = new Date("2026-10-09T04:00:00Z");
  const recent = { started_at: "2026-10-09T03:40:00Z", elapsed_s: 14 };
  it("uses stored elapsed time for a recently paused timed session", () => {
    expect(continueTime(recent, 300, now)).toBe("4:46 left");
  });
  it("shows relative start time for stale, exhausted and untimed sessions", () => {
    expect(
      continueTime({ ...recent, started_at: "2026-10-09T02:00:00Z" }, 300, now),
    ).toBe("Started 2h ago");
    expect(continueTime({ ...recent, elapsed_s: 300 }, 300, now)).toBe(
      "Started 20m ago",
    );
    expect(continueTime({ ...recent, elapsed_s: 301 }, 300, now)).toBe(
      "Started 20m ago",
    );
    expect(continueTime(recent, null, now)).toBe("Started 20m ago");
    expect(
      continueTime(
        { ...recent, started_at: "2026-10-07T04:00:00Z" },
        null,
        now,
      ),
    ).toBe("Started 2d ago");
  });
  it("shows just now for untimed or exhausted sessions under a minute old", () => {
    const session = { started_at: "2026-10-09T03:59:30Z", elapsed_s: 300 };
    expect(continueTime(session, null, now)).toBe("Started just now");
    expect(continueTime(session, 300, now)).toBe("Started just now");
  });
  it("includes the 30 minute recency boundary", () => {
    expect(
      continueTime({ ...recent, started_at: "2026-10-09T03:30:00Z" }, 300, now),
    ).toBe("4:46 left");
    expect(
      continueTime({ ...recent, started_at: "2026-10-09T03:29:59Z" }, 300, now),
    ).toBe("Started 30m ago");
  });
});

it("finds the NSW term, Monday week boundaries and term length", () => {
  const t4 = { term: 4, weeks: 10 };
  expect(schoolWeek("2026-10-13")).toEqual({ ...t4, week: 1 });
  expect(schoolWeek("2026-10-18")).toEqual({ ...t4, week: 1 });
  expect(schoolWeek("2026-10-19")).toEqual({ ...t4, week: 2 });
  expect(schoolWeek("2026-12-17")).toEqual({ ...t4, week: 10 });
  expect(schoolWeek("2026-02-02")).toEqual({ term: 1, week: 1, weeks: 9 });
  expect(schoolWeek("2027-02-03")).toEqual({ term: 1, week: 1, weeks: 10 });
  expect(schoolWeek("2027-04-09")).toEqual({ term: 1, week: 10, weeks: 10 });
  expect(schoolWeek("2026-12-18")).toBeNull();
  expect(schoolWeek("2027-04-10")).toBeNull();
  expect(schoolWeek("2028-02-01")).toBeNull();
});
import { homeUnits, homeWeeks, homeComparison, homeMinutes } from "./home";
import type { HistoryScore, TopicProgress } from "./progress";
const historyRow = (
  finished_at: string,
  pct: number | null,
  elapsed_s = 60,
  kind = "sprint",
): HistoryScore => ({
  id: finished_at,
  kind,
  config: {},
  finished_at,
  pct,
  elapsed_s,
  by_type: {},
});
it("uses Sydney Mondays, excludes card recall, and averages only observed marked scores", () => {
  expect(
    homeWeeks([
      historyRow("2026-10-18T14:00:00Z", 60),
      historyRow("2026-10-20T00:00:00Z", 80),
      historyRow("2026-10-20T01:00:00Z", 100, 60, "flashcards"),
      historyRow("invalid", 100),
      historyRow("2026-10-12T00:00:00Z", null),
    ]),
  ).toEqual([{ day: "2026-10-19", pct: 70 }]);
});
it("compares exact seven-day Sydney periods and omits missing prior comparisons", () => {
  const rows = [
    historyRow("2026-10-12T13:00:00Z", 50, 120),
    historyRow("2026-10-19T13:00:00Z", 70, 300),
    historyRow("2026-10-20T14:00:00Z", 100, 1000),
  ];
  expect(homeComparison(rows, "2026-10-20")).toEqual({ minutes: 3, score: 20 });
  expect(homeComparison(rows.slice(1), "2026-10-20")).toEqual({
    minutes: undefined,
    score: undefined,
  });
});
it("orders parent units without counting their dot points and uses documented estimates", () => {
  const topics = [
    { id: "second", parent_id: null, sort: 2 },
    { id: "leaf", parent_id: "second", sort: 0 },
    { id: "first", parent_id: null, sort: 1 },
  ] as TopicProgress[];
  expect(homeUnits(topics).map((t) => t.id)).toEqual(["first", "second"]);
  expect(homeMinutes(43, "cards")).toBe(15);
  expect(homeMinutes(3, "questions")).toBe(6);
});

import { homeSprintMinutes } from "./home";
it("uses saved sprint sizing or timer and hides unknown estimates", () => {
  expect(homeSprintMinutes({ actual_questions: 8 }, 0)).toBe(16);
  expect(homeSprintMinutes({ time_limit_s: 600 }, 180)).toBe(7);
  expect(homeSprintMinutes({}, 30)).toBeNull();
});

import { homeEarnedMarks, homeExamPrompt } from "./home";
it("sums earned marks by Sydney day, compares seven against seven, and ignores invalid/outside rows", () => {
  const rows = [
    { marked_at: "2026-10-05T13:00:00Z", mark: 4 }, // first Sydney day
    { marked_at: "2026-10-11T13:00:00Z", mark: 3 }, // last prior day
    { marked_at: "2026-10-12T13:00:00Z", mark: 8 }, // first current day
    { marked_at: "2026-10-19T12:59:59Z", mark: 2 }, // today
    { marked_at: "2026-10-19T13:00:00Z", mark: 100 }, // tomorrow
    { marked_at: "2026-10-05T12:59:59Z", mark: 100 }, // before range
    { marked_at: "invalid", mark: 100 },
    { marked_at: null, mark: 100 },
    { marked_at: "2026-10-19T00:00:00Z", mark: null },
  ];
  expect(homeEarnedMarks(rows, "2026-10-19")).toEqual({
    values: [8, 0, 0, 0, 0, 0, 2],
    delta: 3,
  });
  expect(homeEarnedMarks(rows.slice(2), "2026-10-19").delta).toBeUndefined();
  expect(
    homeEarnedMarks(
      [{ marked_at: "2026-10-12T00:00:00Z", mark: 0 }],
      "2026-10-19",
    ).delta,
  ).toBe(0);
});
it("uses the real Sydney exam weekday only within seven days, including exam day", () => {
  expect(homeExamPrompt("2026-10-19")).toBe(
    "What should I study before my exam?",
  );
  expect(homeExamPrompt("2026-10-20")).toBe(
    "What should I study before Tuesday's exam?",
  );
  expect(homeExamPrompt("2026-10-27")).toBe(
    "What should I study before Tuesday's exam?",
  );
  expect(homeExamPrompt("2026-10-28")).toBe(
    "What should I study before my exam?",
  );
});
