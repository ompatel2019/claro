// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readError: null as Error | null,
  kept: { started_at: "2026-10-23T10:00:00Z" } as { started_at: string } | null,
  filters: [] as unknown[][],
  finish: vi.fn(),
  needsAi: vi.fn(),
  daily: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/marking/engine", () => ({ finishSession: mocks.finish }));
vi.mock("@/lib/marking/finish-limits", () => ({
  sessionNeedsAi: mocks.needsAi,
  reserveDailyAiSprint: mocks.daily,
}));
vi.mock("@/lib/ai/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/rate-limit")>()),
  assertStudentAiRateLimit: mocks.rate,
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    from: (table: string) => {
      const chain = {
        select: (columns: string) => {
          mocks.filters.push(["select", table, columns]);
          return chain;
        },
        eq: (...args: unknown[]) => {
          mocks.filters.push(["eq", ...args]);
          return chain;
        },
        in: (...args: unknown[]) => {
          mocks.filters.push(["in", ...args]);
          return chain;
        },
        is: (...args: unknown[]) => {
          mocks.filters.push(["is", ...args]);
          return chain;
        },
        lt: (...args: unknown[]) => {
          mocks.filters.push(["lt", ...args]);
          return chain;
        },
        delete: () => chain,
        maybeSingle: async () =>
          table === "sessions"
            ? { data: mocks.kept, error: null }
            : { data: { role: "student" }, error: null },
        then: (done: (value: unknown) => unknown) =>
          Promise.resolve({ data: mocks.rows, error: mocks.readError }).then(
            done,
          ),
      };
      return chain;
    },
  }),
}));
import {
  IDLE_FINISH_MS,
  finishOpenSessions,
  sessionIdle,
} from "./session-finish";

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();
const row = (id: string, lastActive: string, kind = "sprint") => ({
  id,
  kind,
  finished_at: null,
  last_active_at: lastActive,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.readError = null;
  mocks.kept = { started_at: "2026-10-23T10:00:00Z" };
  mocks.rows = [
    row("live", ago(5 * 60_000)),
    row("stale", ago(IDLE_FINISH_MS + 1000)),
    row("deck", ago(IDLE_FINISH_MS * 3), "flashcards"),
  ];
  mocks.finish.mockResolvedValue({ score: 1, max_score: 2, summary: null });
  mocks.needsAi.mockResolvedValue(false);
  mocks.rate.mockResolvedValue({ ok: true, reservationId: "r" });
  mocks.daily.mockResolvedValue({ ok: true, reservationId: "d" });
});

it("treats 30 minutes without activity as idle", () => {
  expect(sessionIdle(ago(IDLE_FINISH_MS - 1000), now)).toBe(false);
  expect(sessionIdle(ago(IDLE_FINISH_MS), now)).toBe(true);
  expect(sessionIdle(null, now)).toBe(false);
  expect(IDLE_FINISH_MS).toBe(30 * 60_000);
});

it("reads only the verified student's open sprints and decks", async () => {
  await finishOpenSessions("student-1", { idleOnly: true });
  expect(mocks.filters).toEqual([
    [
      "select",
      "sessions",
      "id,kind,finished_at,last_active_at:session_last_active_at",
    ],
    ["eq", "user_id", "student-1"],
    ["in", "kind", ["sprint", "flashcards"]],
    ["is", "finished_at", null],
  ]);
});

it("the idle sweep finishes stale sessions and leaves live ones open", async () => {
  expect(await finishOpenSessions("student-1", { idleOnly: true })).toBe(2);
  expect(mocks.finish.mock.calls.map(([id]) => id)).toEqual(["stale", "deck"]);
});

it("starting a session finishes every other open one", async () => {
  expect(await finishOpenSessions("student-1", { keep: "live" })).toBe(2);
  expect(mocks.finish.mock.calls.map(([id]) => id)).toEqual(["stale", "deck"]);
});

it("a start only finishes sessions started before it, never a newer overlapping start", async () => {
  await finishOpenSessions("student-1", { keep: "new" });
  expect(mocks.filters.slice(0, 4)).toEqual([
    ["select", "sessions", "started_at"],
    ["eq", "id", "new"],
    ["eq", "user_id", "student-1"],
    [
      "select",
      "sessions",
      "id,kind,finished_at,last_active_at:session_last_active_at",
    ],
  ]);
  expect(mocks.filters).toContainEqual([
    "lt",
    "started_at",
    "2026-10-23T10:00:00Z",
  ]);
});

it("a start whose session isn't the student's finishes nothing", async () => {
  mocks.kept = null;
  expect(await finishOpenSessions("student-1", { keep: "other" })).toBe(0);
  expect(mocks.finish).not.toHaveBeenCalled();
});

it("can finish one reopened session only", async () => {
  expect(await finishOpenSessions("student-1", { only: "live" })).toBe(1);
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("live");
});

it("reserves the AI allowance before marking written answers", async () => {
  mocks.needsAi.mockResolvedValue(true);
  await finishOpenSessions("student-1", { only: "stale" });
  expect(mocks.needsAi).toHaveBeenCalledWith("stale", "student-1");
  expect(mocks.rate).toHaveBeenCalledWith({
    userId: "student-1",
    role: "student",
  });
  expect(mocks.daily).toHaveBeenCalledWith("student-1", "stale");
});

it("a rate-limited session stays open for the next sweep without blocking others", async () => {
  mocks.needsAi.mockImplementation(async (id: string) => id === "stale");
  mocks.daily.mockResolvedValue({
    ok: false,
    error: "You've reached today's sprint limit. Try again tomorrow.",
    retryAfterSec: 86400,
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await finishOpenSessions("student-1", { idleOnly: true })).toBe(1);
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("deck");
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

it("surfaces a failed session read", async () => {
  mocks.readError = new Error("read failed");
  await expect(finishOpenSessions("student-1")).rejects.toThrow("read failed");
  expect(mocks.finish).not.toHaveBeenCalled();
});
