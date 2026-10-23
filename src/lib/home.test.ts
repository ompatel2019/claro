import { describe, expect, it } from "vitest";
import {
  continueTime,
  greeting,
  longDate,
  schoolWeek,
  studyQuote,
} from "./home";

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
  expect(schoolWeek("2027-10-11")).toEqual({ term: 4, week: 1, weeks: 10 });
  expect(schoolWeek("2027-12-17")).toEqual({ term: 4, week: 10, weeks: 10 });
  expect(schoolWeek("2027-12-18")).toBeNull();
  expect(schoolWeek("2028-02-01")).toBeNull();
});

import {
  nextStepTopic,
  NEXT_STEP_MIN_ANSWERS,
  practiceWeek,
  practiceAverage,
  WEEKLY_PRACTICE_GOAL,
} from "./home";
import type { ProgressData, TopicProgress } from "./progress";
const topic = (
  id: string,
  earned: number,
  sort = 1,
  answered = NEXT_STEP_MIN_ANSWERS,
  parent_id: string | null = null,
): TopicProgress => ({
  id,
  name: id,
  parent_id,
  sort,
  answered,
  earned,
  possible: 10,
  pct: null,
  last_answered: null,
});
const data = (topics: TopicProgress[]): ProgressData => ({
  topics,
  types: [],
  verbs: [],
  history: [],
  mastery: [],
  missed: [],
  due: [],
});
it("picks the weakest supported parent with deterministic ties and falls back to dot points", () => {
  expect(
    nextStepTopic(
      data([
        topic("too-few", 0, 0, 2),
        topic("strong", 8),
        topic("b", 4, 2),
        topic("a", 4, 1),
      ]),
    )?.id,
  ).toBe("a");
  expect(nextStepTopic(data([topic("b", 4), topic("a", 4)]))?.id).toBe("a");
  expect(nextStepTopic(data([topic("leaf", 1, 1, 3, "parent")]))?.id).toBe(
    "leaf",
  );
  expect(nextStepTopic(data([topic("sparse", 0, 1, 1)]))).toBeNull();
  expect(nextStepTopic(null)).toBeNull();
});
it("makes Monday–Sunday Sydney days, counting questions or cards and excluding future days", () => {
  const week = practiceWeek("2026-10-25", [
    { day: "2026-10-19", questions: 1, cards: 0 },
    { day: "2026-10-25", questions: 0, cards: 2 },
    { day: "2026-10-18", questions: 9, cards: 0 },
  ]);
  expect(week.map((d) => d.day)).toEqual([
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
  expect(week.filter((d) => d.done)).toHaveLength(2);
  expect(week[6].today).toBe(true);
  expect(
    practiceWeek("2026-10-19", [
      { day: "2026-10-20", questions: 1, cards: 0 },
    ]).some((d) => d.done),
  ).toBe(false);
  expect(WEEKLY_PRACTICE_GOAL).toBe(5);
});
it("weights practice average by possible marks without double counting dot points or recall", () => {
  expect(
    practiceAverage(
      data([topic("parent", 6), topic("leaf", 1, 1, 3, "parent")]),
    ),
  ).toBe(60);
  expect(practiceAverage(data([]))).toBeNull();
  expect(practiceAverage(null)).toBeNull();
});

it("rotates original study quotes deterministically by Sydney day", () => {
  expect(studyQuote("2026-10-19")).toBe(studyQuote("2026-10-19"));
  expect(studyQuote("2026-10-19")).not.toBe(studyQuote("2026-10-20"));
  expect(studyQuote("2026-10-19")).toBe(studyQuote("2026-10-26"));
});
