import { expect, it } from "vitest";
import type { ReviewRow } from "@/lib/feedback";
import {
  firstLost,
  fullMarks,
  lostMarks,
  questionList,
  scoreVsAverage,
  timeVsAverage,
} from "./results-stats";

const row = (mark: number | null, marks: number, status = "marked") =>
  ({ mark, marks, max_marks: marks, status, feedback: {} }) as ReviewRow;

it("counts full and lost marks, leaving rows still being marked alone", () => {
  expect(fullMarks(row(2, 2))).toBe(true);
  expect(lostMarks(row(2, 2))).toBe(false);
  expect(lostMarks(row(1, 2))).toBe(true);
  expect(lostMarks(row(0, 1))).toBe(true);
  expect(lostMarks(row(null, 2, "marking"))).toBe(false);
  expect(lostMarks(row(null, 2, "skipped"))).toBe(true);
});

it("opens on the first question that lost marks, else the first", () => {
  expect(firstLost([row(2, 2), row(0, 1), row(1, 2)])).toBe(1);
  expect(firstLost([row(2, 2), row(1, 1)])).toBe(0);
  expect(firstLost([])).toBe(0);
});

it.each([
  [[], ""],
  [[2], "Q2"],
  [[2, 3], "Q2 and Q3"],
  [[2, 3, 7], "Q2, Q3 and Q7"],
])("lists %j as %s", (positions, text) => {
  expect(questionList(positions)).toBe(text);
});

it("compares score and time with the average in plain words", () => {
  expect(scoreVsAverage(73.3, 67)).toEqual({
    text: "6 points above your average",
    up: true,
  });
  expect(scoreVsAverage(60, 61)).toEqual({
    text: "1 point below your average",
    up: false,
  });
  expect(scoreVsAverage(60, 60.2)?.text).toBe("Same as your average");
  expect(scoreVsAverage(null, 60)).toBeNull();
  expect(timeVsAverage(1000, 1070)).toBe("1:10 quicker than your average");
  expect(timeVsAverage(1100, 1000)).toBe("1:40 slower than your average");
  expect(timeVsAverage(1000, 1002)).toBe("About your average time");
  expect(timeVsAverage(1000, null)).toBeNull();
});
