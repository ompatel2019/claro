import { expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
const q = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const result = { value: { data: [] as unknown, error: null as unknown } };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "limit", "gte"])
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
import { loadMarkedComments, loadProgress } from "./progress-data";
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
  expect(await loadMarkedComments("me", "2026-10-01")).toEqual([
    { marked_at: "2026-10-01T15:00:00Z", comments: [{ tag: "Verb" }] },
  ]);
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
