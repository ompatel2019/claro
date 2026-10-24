import { expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
const q = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const result = { value: { data: [] as unknown, error: null as unknown } };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "gt", "not", "order", "range", "gte"])
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  chain.then = (ok: (v: unknown) => unknown) => ok(result.value);
  return { calls, result, chain, from: vi.fn(() => chain) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc, from: q.from }),
}));
import {
  loadMarkedComments,
  loadProgress,
  loadSessionScores,
} from "./progress-data";
it("requests SQL aggregation with inclusive Sydney range dates, never limited raw rows", async () => {
  rpc.mockResolvedValue({
    data: { topics: [{ answered: 1501, sessions: 100 }] },
    error: null,
  });
  expect(await loadProgress("90", "2026-10-09")).toEqual({
    topics: [{ answered: 1501, sessions: 100 }],
  });
  expect(rpc).toHaveBeenLastCalledWith("student_progress", {
    p_from: "2026-07-12",
    p_to: "2026-10-09",
  });
  await loadProgress("all", "2026-10-09");
  expect(rpc).toHaveBeenLastCalledWith("student_progress", {
    p_from: null,
    p_to: "2026-10-09",
  });
});
it("does not turn an RPC error into zero totals", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  await expect(loadProgress("30", "2026-10-09")).rejects.toThrow(
    "Could not load progress",
  );
});

it("reads only the student's own marker comments from finished sessions in range", async () => {
  q.result.value = {
    data: [
      {
        marked_at: "2026-10-01T15:00:00Z",
        comments: [{ tag: "Verb" }],
        sessions: {},
      },
      // 30 Sep 23:00 Sydney: before the range.
      { marked_at: "2026-09-30T13:00:00Z", comments: [], sessions: {} },
    ],
    error: null,
  };
  expect(await loadMarkedComments("me", "2026-10-01")).toEqual({
    complete: true,
    rows: [{ marked_at: "2026-10-01T15:00:00Z", comments: [{ tag: "Verb" }] }],
  });
  expect(q.from).toHaveBeenCalledWith("attempts");
  expect(q.calls).toEqual(
    expect.arrayContaining([
      ["eq", "user_id", "me"],
      ["eq", "status", "marked"],
      ["not", "sessions.finished_at", "is", null],
      ["gte", "marked_at", "2026-09-30"],
    ]),
  );
  q.result.value = { data: null, error: { message: "denied" } };
  expect(await loadMarkedComments("me", null)).toBeNull();
});

it("reads the student's own finished non-flashcard session marks in range", async () => {
  q.calls.length = 0;
  q.result.value = {
    data: [
      { finished_at: "2026-10-01T15:00:00Z", score: 3, max_score: 4 },
      { finished_at: "2026-09-30T13:00:00Z", score: 1, max_score: 4 },
    ],
    error: null,
  };
  expect(await loadSessionScores("me", "2026-10-01")).toEqual([
    { finished_at: "2026-10-01T15:00:00Z", score: 3, max_score: 4 },
  ]);
  expect(q.from).toHaveBeenLastCalledWith("score_history");
  expect(q.calls).toEqual(
    expect.arrayContaining([
      ["eq", "user_id", "me"],
      ["neq", "kind", "flashcards"],
      ["gt", "max_score", 0],
      ["gte", "finished_at", "2026-09-30"],
    ]),
  );
  q.result.value = { data: null, error: { message: "denied" } };
  expect(await loadSessionScores("me", null)).toBeNull();
});

it("pages past PostgREST's row cap and flags a truncated comment read", async () => {
  q.calls.length = 0;
  const row = {
    id: "x",
    finished_at: "2026-10-02T01:00:00Z",
    score: 1,
    max_score: 2,
    marked_at: "2026-10-02T01:00:00Z",
    comments: [],
  };
  q.result.value = {
    data: Array.from({ length: 1000 }, () => row),
    error: null,
  };
  // Every page is full, so the session read hits its cap and reports unavailable…
  expect(await loadSessionScores("me", null)).toBeNull();
  expect(q.calls.filter((c) => c[0] === "range").slice(0, 2)).toEqual([
    ["range", 0, 999],
    ["range", 1000, 1999],
  ]);
  // …and the comments read stops at its cap, marked incomplete.
  const out = await loadMarkedComments("me", null);
  expect(out?.complete).toBe(false);
  expect(out?.rows).toHaveLength(5000);
});
