import { describe, expect, it } from "vitest";
import type { ReviewRow } from "./feedback";
import {
  delta,
  resultsState,
  mcGridRows,
  visibleResults,
  firstBelow,
  kpis,
  markingInFlight,
  markTone,
  sprintHref,
  timeMeta,
} from "./results";

const row = (o: Partial<ReviewRow>): ReviewRow =>
  ({
    type: "short",
    marks: 4,
    max_marks: 4,
    status: "marked",
    check_status: "none",
    feedback: {},
    mark: 4,
    topic_id: "t3-inflation",
    ...o,
  }) as ReviewRow;
describe("results", () => {
  it("tallies scored questions only, split by MC and written", () => {
    const k = kpis([
      row({ type: "mcq", marks: 1, max_marks: 1, mark: 1 }),
      row({ mark: 2 }),
      row({ status: "pending", mark: null }),
      row({ mark: 0, feedback: { note: "No answer" } }),
    ]);
    expect(k.score).toEqual({ mark: 3, max: 9 });
    expect(k.mc).toEqual({ mark: 1, max: 1 });
    expect(k.written).toEqual({ mark: 2, max: 8 });
    expect(k.writtenCount).toBe(3);
  });
  it("opens on the first question below full marks", () => {
    expect(
      firstBelow([row({}), row({ status: "pending" }), row({ mark: 3 })]),
    ).toBe(2);
    expect(firstBelow([row({}), row({})])).toBe(0);
  });
  it("labels time against the limit", () => {
    expect(timeMeta(1930, 2700)).toBe("32:10 of 45:00");
    expect(timeMeta(2892, 2700)).toBe("3:12 over time");
    expect(timeMeta(65, null)).toBe("1:05");
  });
  it("describes deltas", () => {
    expect(delta(70, 64, " pts")).toBe("+6 pts vs your average");
    expect(delta(60, 64.4, " pts")).toBe("−4 pts vs your average");
    expect(delta(64, 64.2)).toBe("Same as your average");
    expect(delta(60, null)).toBeNull();
  });
  it("colours chips by share of marks", () => {
    expect(markTone(4, 4)).toMatch(/success/);
    expect(markTone(1, 4)).toMatch(/warning/);
    expect(markTone(0, 4)).toMatch(/destructive/);
  });
  it("links back to setup with the same type and topics", () => {
    expect(
      sprintHref(
        { mode: "short", topics: ["t3"], subtopics: ["t3-inflation"] },
        { history: "mistakes" },
      ),
    ).toBe(
      "/student/sprint?type=short&topics=t3&sub=t3-inflation&history=mistakes",
    );
  });
});

describe("MC results", () => {
  it("builds compact MC rows, including unanswered, wrong and unavailable keys", () => {
    expect(
      mcGridRows([
        row({
          position: 1,
          type: "mcq",
          choice_index: 1,
          correct_index: 1,
          check_status: "skipped",
        }),
        row({ position: 2, type: "mcq", choice_index: 0, correct_index: 2 }),
        row({ position: 3, type: "mcq", choice_index: null, correct_index: 3 }),
        row({ position: 4, type: "mcq", choice_index: 0, correct_index: null }),
        row({ position: 5, type: "mcq", status: "skipped" }),
        row({ position: 6 }),
      ]),
    ).toEqual([
      { position: 1, your: "B", correct: "B", answered: true, right: true },
      { position: 2, your: "A", correct: "C", answered: true, right: false },
      {
        position: 3,
        your: "Not answered",
        correct: "D",
        answered: false,
        right: false,
      },
      {
        position: 4,
        your: "A",
        correct: "Unavailable",
        answered: true,
        right: null,
      },
    ]);
  });
  it("keeps a marked MC answer whose blind check was skipped", () => {
    expect(
      visibleResults([
        row({ status: "skipped" }),
        row({ type: "mcq", check_status: "skipped" }),
      ]),
    ).toHaveLength(1);
  });
});

it("counts successful marks separately from failures and only waits for active marking", () => {
  const rows = [
    row({}),
    row({ check_status: "in_review" }),
    row({ status: "failed" }),
    row({ status: "unreadable" }),
    row({ status: "marking" }),
    row({ status: "skipped" }),
  ];
  expect(resultsState(rows, null)).toEqual({
    done: 2,
    total: 5,
    attention: 2,
    marking: 1,
    summaryPending: true,
  });
  expect(
    resultsState(
      rows.filter((r) => r.status !== "marking"),
      null,
    ),
  ).toEqual({
    done: 2,
    total: 4,
    attention: 2,
    marking: 0,
    summaryPending: false,
  });
  expect(resultsState(rows, {}).summaryPending).toBe(false);
});

it("excludes internal uncertainty from student results payloads", () => {
  const stored = row({
    feedback: {
      justification: "Evidence",
      flags: { uncertain: true, marks: [3, 2] },
    },
  });
  expect(visibleResults([stored])[0].feedback).toEqual({
    justification: "Evidence",
  });
  expect(stored.feedback).toHaveProperty("flags");
});

it("excludes unscored and low-confidence own checks from totals and below-full-marks selection", () => {
  const rows = [
    row({ mark: null, feedback: { confidence: "low" } }),
    row({ mark: 0, feedback: { confidence: "low" } }),
    row({ mark: null }),
    row({ mark: 3 }),
  ];
  expect(kpis(rows).score).toEqual({ mark: 3, max: 4 });
  expect(firstBelow(rows)).toBe(3);
});

describe("markingInFlight", () => {
  const now = Date.parse("2026-10-19T00:10:00Z");
  const at = (status: string, claimed_at: string | null) => ({
    status,
    claimed_at,
  });
  it("is true for a fresh claim, false for a stale or absent one", () => {
    expect(
      markingInFlight([at("marking", "2026-10-19T00:08:00Z")], "each", now),
    ).toBe(true);
    expect(
      markingInFlight([at("marking", "2026-10-19T00:01:00Z")], "each", now),
    ).toBe(false);
    expect(markingInFlight([at("answered", null)], "end", now)).toBe(false);
  });
  it("treats marked answers as Finish under way only in exam mode", () => {
    expect(markingInFlight([at("marked", null)], "end", now)).toBe(true);
    expect(markingInFlight([at("marked", null)], "each", now)).toBe(false);
  });
});
