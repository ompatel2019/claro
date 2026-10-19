import { describe, expect, it } from "vitest";
import {
  continueTime,
  greeting,
  longDate,
  schoolWeek,
  dailyQuote,
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
  expect(schoolWeek("2028-02-01")).toBeNull();
});
it("rotates the same short quote deterministically for a Sydney day", () => {
  expect(dailyQuote("2026-10-19")).toBe(dailyQuote("2026-10-19"));
  expect(dailyQuote("2026-10-20")).not.toBe(dailyQuote("2026-10-19"));
  expect(dailyQuote("2026-10-26")).toBe(dailyQuote("2026-10-19"));
});
