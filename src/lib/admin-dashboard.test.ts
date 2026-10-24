import { expect, it } from "vitest";
import { lastWeek, spendMeter } from "./admin-dashboard";

it("puts month-to-date spend over the cap, rounded and clamped", () => {
  expect(spendMeter(14.25, 100)).toEqual({ pct: 14, text: "$14.25 of $100" });
  expect(spendMeter(0, 100)).toEqual({ pct: 0, text: "$0.00 of $100" });
  expect(spendMeter(132.4, 100).pct).toBe(100);
  expect(spendMeter(-3, 100)).toEqual({ pct: 0, text: "$0.00 of $100" });
  expect(spendMeter(Number.NaN, 100).pct).toBe(0);
  expect(spendMeter(5, 0).pct).toBe(0);
});

it("totals the last 7 days and compares them with the 7 before", () => {
  const days = (values: number[]) => values.map((value) => ({ value }));
  expect(lastWeek(days([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]))).toEqual({
    now: 14,
    delta: 7,
  });
  expect(lastWeek(days([0, 0, 0, 3]))).toEqual({ now: 3, delta: null });
  expect(lastWeek([])).toEqual({ now: 0, delta: null });
});
