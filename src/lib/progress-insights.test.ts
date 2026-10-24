import { expect, it } from "vitest";
import type { TopicProgress } from "./progress";
import type { SessionScore } from "./progress-insights";
import {
  coverage,
  markerAsks,
  marksLost,
  practiceTrend,
} from "./progress-insights";

const session = (
  finished_at: string,
  score: number,
  max_score = 10,
): SessionScore => ({
  finished_at,
  score,
  max_score,
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

it("buckets finished sessions by Sydney day, weighting by marks available, with gaps", () => {
  const t = practiceTrend(
    [
      // 2026-10-08 13:30Z is 9 Oct 00:30 in Sydney.
      session("2026-10-08T13:30:00Z", 2, 10),
      session("2026-10-09T01:00:00Z", 27, 30),
      session("2026-10-04T01:00:00Z", 5),
      { finished_at: "2026-10-09T01:00:00Z", score: "1.5", max_score: "2" },
      session("2026-10-09T01:00:00Z", 3, 0),
      { finished_at: null, score: 1, max_score: 1 },
      session("2026-09-01T01:00:00Z", 1),
    ],
    "2026-10-03",
    "2026-10-09",
  );
  expect(t.size).toBe(1);
  expect(t.sessions).toBe(4);
  expect(t.points.map((p) => p.day)).toEqual([
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
  ]);
  // 9 Oct: (2 + 27 + 1.5) / (10 + 30 + 2) = 73%, not the 70% mean of session scores.
  expect(t.points.map((p) => p.pct)).toEqual([
    null,
    50,
    null,
    null,
    null,
    null,
    73,
  ]);
  expect(t.points[6].sessions).toBe(3);
});

it("uses weeks ending today for 90 days and 30-day blocks for long spans", () => {
  const w = practiceTrend(
    [session("2026-10-02T01:00:00Z", 4)],
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
    [session("2025-01-01T01:00:00Z", 4)],
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
  // Parent totals include whole-topic questions; their marks are kept as a row.
  const whole = marksLost([
    { ...rows[0], earned: 7, possible: 20, answered: 9, pct: 35 },
    ...rows.slice(1),
  ]);
  expect(
    whole.map((l) => [l.topic.id, l.lost, l.possible, l.whole, l.weak]),
  ).toEqual([
    ["a", 8, 10, false, true],
    ["b", 3, 4, false, false],
    ["p", 2, 3, true, false],
  ]);
  expect(
    marksLost([
      topic({ id: "q", earned: 1, possible: 6, answered: 6, pct: 16.7 }),
    ]),
  ).toMatchObject([{ lost: 5, whole: true, parent: null }]);
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
