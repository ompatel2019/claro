import { afterEach, expect, it, vi } from "vitest";
import { sydneyDay as adminDay } from "./admin";
import { sydneyToday as flashcardDay } from "./flashcards";
import { sydneyDay as singleDay, sydneyDayStart } from "./single-check";
import { shiftDay, sydneyDay, sydneyToday } from "./sydney-day";

afterEach(() => vi.useRealTimers());

it.each([
  ["2026-04-04T12:59:59.999Z", "2026-04-04"],
  ["2026-04-04T13:00:00.000Z", "2026-04-05"],
  ["2026-04-04T15:59:59.999Z", "2026-04-05"],
  ["2026-04-04T16:00:00.000Z", "2026-04-05"],
  ["2026-04-05T13:59:59.999Z", "2026-04-05"],
  ["2026-04-05T14:00:00.000Z", "2026-04-06"],
  ["2026-10-03T13:59:59.999Z", "2026-10-03"],
  ["2026-10-03T14:00:00.000Z", "2026-10-04"],
  ["2026-10-03T15:59:59.999Z", "2026-10-04"],
  ["2026-10-03T16:00:00.000Z", "2026-10-04"],
  ["2026-10-04T12:59:59.999Z", "2026-10-04"],
  ["2026-10-04T13:00:00.000Z", "2026-10-05"],
  ["2028-02-28T13:00:00.000Z", "2028-02-29"],
  ["2026-12-31T13:00:00.000Z", "2027-01-01"],
])("keeps every Sydney-day entry point consistent at %s", (iso, day) => {
  expect(sydneyDay(iso)).toBe(day);
  expect(adminDay(iso)).toBe(day);
  for (const format of [
    sydneyDay,
    adminDay,
    singleDay,
    sydneyToday,
    flashcardDay,
  ])
    expect(format(new Date(iso))).toBe(day);
});

it("retains current-time defaults and explicit undefined for student helpers", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T13:00:00Z"));
  for (const format of [singleDay, sydneyToday, flashcardDay]) {
    expect(format()).toBe("2026-10-05");
    expect(format(undefined)).toBe("2026-10-05");
  }
});

it("retains invalid-date errors and parses offset strings in the admin helper", () => {
  for (const format of [
    sydneyDay,
    adminDay,
    singleDay,
    sydneyToday,
    flashcardDay,
  ])
    expect(() => format(new Date(NaN))).toThrow(RangeError);
  expect(() => adminDay("invalid")).toThrow(RangeError);
  expect(adminDay("2026-10-05T00:00:00+11:00")).toBe("2026-10-05");
});

it.each([
  ["2026-04-05T06:00:00Z", "2026-04-04T13:00:00.000Z"],
  ["2026-04-06T06:00:00Z", "2026-04-05T14:00:00.000Z"],
  ["2026-10-04T06:00:00Z", "2026-10-03T14:00:00.000Z"],
  ["2026-10-05T06:00:00Z", "2026-10-04T13:00:00.000Z"],
])("preserves the distinct midnight calculation at %s", (iso, midnight) => {
  expect(sydneyDayStart(new Date(iso))).toBe(midnight);
});

it.each([
  ["2026-04-05", 1, "2026-04-06"],
  ["2026-10-04", 1, "2026-10-05"],
  ["2026-10-05", -1, "2026-10-04"],
  ["2028-02-28", 1, "2028-02-29"],
  ["2026-12-31", 1, "2027-01-01"],
  ["2026-10-04", 0, "2026-10-04"],
  ["2026-10-04T23:00:00Z", 0.5, "2026-10-05"],
])("shifts %s by %s using the original UTC parsing", (day, days, expected) => {
  expect(shiftDay(day, days)).toBe(expected);
});

it("retains day-shift errors for invalid dates and non-finite offsets", () => {
  expect(() => shiftDay("invalid", 1)).toThrow(RangeError);
  expect(() => shiftDay("2026-10-04", Infinity)).toThrow(RangeError);
});
