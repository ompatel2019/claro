import { describe, expect, it } from "vitest";
import {
  weakestTopics,
  type TopicProgress,
  parseRange,
  rangeFrom,
  reportHref,
  practiseHref,
} from "./progress";
import { fromParams, restore } from "./sprint";
import { scoreTone } from "./practice";

describe("progress ranges use inclusive Sydney calendar days", () => {
  it.each([
    [undefined, "90"],
    ["bad", "90"],
    [["30", "90"], "90"],
    ["30", "30"],
    ["90", "90"],
    ["year", "year"],
    ["all", "all"],
  ] as const)("parses %s", (value, expected) =>
    expect(parseRange(value as string | string[] | undefined)).toBe(expected),
  );
  it("handles year boundaries and leap days", () => {
    expect(rangeFrom("30", "2026-01-01")).toBe("2025-12-03");
    expect(rangeFrom("90", "2026-10-09")).toBe("2026-07-12");
    expect(rangeFrom("year", "2026-10-09")).toBe("2026-01-01");
    expect(rangeFrom("30", "2024-03-01")).toBe("2024-02-01");
    expect(rangeFrom("all", "2026-10-09")).toBeNull();
  });
});
it.each([
  [0, "destructive"],
  [49.99, "destructive"],
  [50, "warning"],
  [74.99, "warning"],
  [75, "success"],
  [100, "success"],
] as const)("uses exact score threshold %s", (pct, tone) =>
  expect(scoreTone(pct)).toBe(tone),
);
it("builds existing report and setup routes including single-answer sessions", () => {
  expect(reportHref({ id: "a", kind: "single" })).toBe("/student/activity/a");
  expect(reportHref({ id: "a", kind: "sprint" })).toBe("/student/activity/a");
  expect(reportHref({ id: "a", kind: "paper" })).toBeNull();
  expect(reportHref({ id: "a", kind: "flashcards" })).toBe(
    "/student/flashcards/a",
  );
  expect(practiseHref({ id: "t1", parent_id: null })).toBe(
    "/student/sprint?topics=t1",
  );
});

it("verb practise links override a saved MC setup using main's understood parameters", () => {
  const url = new URL(
    "/student/sprint?type=short&verb=Analyse",
    "https://claro.test",
  );
  const setup = fromParams(
    Object.fromEntries(url.searchParams),
    restore({ mode: "mcq" }),
  );
  expect(setup?.mode).toBe("short");
  expect(setup?.verbs).toEqual(["Analyse"]);
});

it("orders scored topics weakest first without mutating data or prioritising unstarted topics", () => {
  const rows = [
    { id: "new", pct: null, sort: 0 },
    { id: "strong", pct: 90, sort: 1 },
    { id: "weak", pct: 0, sort: 2 },
    { id: "tie", pct: 90, sort: 3 },
  ] as TopicProgress[];
  expect(weakestTopics(rows).map((r) => r.id)).toEqual([
    "weak",
    "strong",
    "tie",
    "new",
  ]);
  expect(rows[0].id).toBe("new");
  expect(weakestTopics([])).toEqual([]);
});
