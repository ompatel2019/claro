import { expect, it } from "vitest";
import type { HistoryScore, TopicProgress } from "./progress";
import {
  coverage,
  markerAsks,
  marksLost,
  practiceTrend,
} from "./progress-insights";

const session = (
  id: string,
  finished_at: string,
  pct: number | null,
  kind = "sprint",
): HistoryScore => ({
  id,
  kind,
  config: {},
  finished_at,
  elapsed_s: 60,
  pct,
  by_type: {},
});
const topic = (t: Partial<TopicProgress> & { id: string }): TopicProgress => ({
  parent_id: null,
  name: t.id,
  sort: 1,
  answered: 0,
  earned: 0,
  possible: 0,
  pct: null,
  last_answered: null,
  ...t,
});

it("buckets scored sessions by Sydney day, skips flashcards and leaves gaps", () => {
  const t = practiceTrend(
    [
      // 2026-10-08 13:30Z is 9 Oct 00:30 in Sydney.
      session("a", "2026-10-08T13:30:00Z", 60),
      session("b", "2026-10-09T01:00:00Z", 80),
      session("c", "2026-10-04T01:00:00Z", 50),
      session("cards", "2026-10-09T01:00:00Z", 100, "flashcards"),
      session("none", "2026-10-09T01:00:00Z", null),
      session("old", "2026-09-01T01:00:00Z", 10),
    ],
    "2026-10-03",
    "2026-10-09",
  );
  expect(t.size).toBe(1);
  expect(t.sessions).toBe(3);
  expect(t.points.map((p) => p.day)).toEqual([
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
  ]);
  expect(t.points.map((p) => p.pct)).toEqual([
    null,
    50,
    null,
    null,
    null,
    null,
    70,
  ]);
  expect(t.points[6].sessions).toBe(2);
});

it("uses weeks ending today for 90 days and 30-day blocks for long spans", () => {
  const w = practiceTrend(
    [session("a", "2026-10-02T01:00:00Z", 40)],
    "2026-07-12",
    "2026-10-09",
  );
  expect(w.size).toBe(7);
  expect(w.points.at(-1)).toEqual({
    day: "2026-10-03",
    pct: null,
    sessions: 0,
  });
  expect(w.points.at(-2)).toEqual({ day: "2026-09-26", pct: 40, sessions: 1 });
  const all = practiceTrend(
    [session("a", "2025-01-01T01:00:00Z", 40)],
    null,
    "2026-10-09",
  );
  expect(all.size).toBe(30);
  expect(all.points[0].pct).toBe(40);
  expect(practiceTrend([], null, "2026-10-09")).toMatchObject({
    size: 1,
    sessions: 0,
  });
});

it("ranks dot points by marks lost and flags weak ones with the shared rule", () => {
  const rows = [
    topic({ id: "p", name: "Economic Issues" }),
    topic({
      id: "a",
      parent_id: "p",
      name: "Inflation",
      answered: 5,
      sessions: 2,
      earned: 2,
      possible: 10,
      pct: 20,
    }),
    topic({
      id: "b",
      parent_id: "p",
      name: "Growth",
      answered: 1,
      sessions: 1,
      earned: 1,
      possible: 4,
      pct: 25,
    }),
    topic({
      id: "c",
      parent_id: "p",
      name: "Full",
      answered: 2,
      earned: 3,
      possible: 3,
      pct: 100,
    }),
    topic({ id: "d", parent_id: "p", name: "None" }),
  ];
  const lost = marksLost(rows);
  expect(lost.map((l) => [l.topic.id, l.lost, l.weak, l.parent])).toEqual([
    ["a", 8, true, "Economic Issues"],
    ["b", 3, false, "Economic Issues"],
  ]);
  expect(coverage(rows)).toEqual({ practised: 3, total: 4 });
});

it("counts each tagged fix once per answer and keeps the marker's latest words", () => {
  const out = markerAsks([
    {
      marked_at: "2026-10-01T00:00:00Z",
      comments: [{ kind: "fix", tag: "Evidence", body: "Older evidence note" }],
    },
    {
      marked_at: "2026-10-05T00:00:00Z",
      comments: [
        {
          kind: "fix",
          tag: "Evidence",
          body: "b",
          next_mark: "Name a real policy.",
        },
        { kind: "fix", tag: "Evidence", body: "again" },
        { kind: "strength", tag: "Analysis", body: "Good chain" },
        { kind: "fix", tag: "Made up", body: "x" },
        { type: "improvement", comment: "old shape, no tag" },
        { kind: "fix", tag: "Verb", body: "  Evaluate needs a judgement.  " },
      ],
    },
    { marked_at: "2026-10-06T00:00:00Z", comments: null },
  ]);
  expect(out.answers).toBe(2);
  expect(out.asks).toEqual([
    { tag: "Evidence", answers: 2, latest: "Name a real policy." },
    { tag: "Verb", answers: 1, latest: "Evaluate needs a judgement." },
  ]);
  expect(markerAsks([])).toEqual({ answers: 0, asks: [] });
});
