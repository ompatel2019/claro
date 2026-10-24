import { describe, expect, it } from "vitest";
import {
  activityStreaks,
  addDays,
  dayLabel,
  heatmapWeeks,
  monthLabels,
  shade,
} from "./activity";

describe("activity heatmap", () => {
  it("builds 53 Monday-first weeks ending with today's week", () => {
    const weeks = heatmapWeeks("2026-10-08"); // a Thursday
    expect(weeks).toHaveLength(53);
    expect(weeks.at(-1)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      null,
      null,
      null,
    ]);
    expect(weeks[0][0]).toBe("2025-10-06");
    expect(new Date(`${weeks[0][0]}T00:00:00Z`).getUTCDay()).toBe(1);
    const sunday = heatmapWeeks("2026-10-11");
    expect(sunday.at(-1)!.every(Boolean)).toBe(true);
  });
  it("labels each month once, over its first week", () => {
    const labels = monthLabels(heatmapWeeks("2026-10-08"));
    expect(labels[0]).toEqual({ col: 0, label: "Oct" });
    expect(labels.map((l) => l.label)).toContain("Jan");
    expect(labels.map((l) => l.label)).toContain("Sep");
    expect(labels.every((l) => l.label.length === 3)).toBe(true);
    expect(new Set(labels.map((l) => l.col)).size).toBe(labels.length);
  });
  it("uses fixed shade buckets", () => {
    expect([0, 1, 5, 6, 15, 16, 30, 31, 200].map(shade)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
  it("formats the tooltip", () => {
    expect(dayLabel("2026-10-08", 14, 20)).toBe(
      "Thu 8 Oct 2026 · 14 questions · 20 flashcards",
    );
    expect(dayLabel("2026-10-08", 1)).toBe("Thu 8 Oct 2026 · 1 question");
    expect(dayLabel("2026-10-08")).toBe("Thu 8 Oct 2026 · No activity");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("activityStreaks", () => {
  const day = (d: string, questions = 1, cards = 0) => ({
    day: d,
    questions,
    cards,
  });
  const from = "2025-10-20";
  const today = "2026-10-19";

  it("never reports a streak longer than the active days shown", () => {
    // The old screen said "4-day streak" beside "1 active day in the last year".
    const s = activityStreaks([day(today)], today, from);
    expect(s).toEqual({ current: 1, longest: 1, active: 1 });
    expect(s.current).toBeLessThanOrEqual(s.active);
  });

  it("counts a run ending yesterday and breaks on a gap", () => {
    const s = activityStreaks(
      [
        day("2026-10-10"),
        day("2026-10-11"),
        day("2026-10-12"),
        day("2026-10-16"),
        day("2026-10-17"),
        day("2026-10-18"),
        day("2026-10-18"),
      ],
      today,
      from,
    );
    expect(s).toEqual({ current: 3, longest: 3, active: 6 });
  });

  it("ignores empty, future and pre-window days", () => {
    const s = activityStreaks(
      [
        day("2025-10-18"),
        day("2025-10-19"),
        day("2026-10-17", 0, 0),
        day("2026-10-18", 0, 3),
        day(today),
        day("2026-10-20"),
        day("2026-10-21"),
      ],
      today,
      from,
    );
    expect(s).toEqual({ current: 2, longest: 2, active: 2 });
  });

  it("is zero when the last active day is before yesterday", () => {
    const s = activityStreaks([day("2026-10-15")], today, from);
    expect(s).toEqual({ current: 0, longest: 1, active: 1 });
  });
});
