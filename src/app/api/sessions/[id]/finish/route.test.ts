// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  kind: "sprint",
  finishedAt: null as string | null,
  role: "student",
  count: 0,
  countError: null as Error | null,
  signedIn: true,
  missing: false,
  finish: vi.fn(),
  rate: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  neq: vi.fn(),
  not: vi.fn(),
  gte: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/rate-limit")>()),
  assertStudentAiRateLimit: mocks.rate,
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocks.signedIn ? { id: "u" } : null },
      }),
    },
    from: (table: string) => ({
      select(...args: unknown[]) {
        mocks.select(...args);
        return this;
      },
      eq(...args: unknown[]) {
        mocks.eq(...args);
        return this;
      },
      neq(...args: unknown[]) {
        mocks.neq(...args);
        return this;
      },
      not(...args: unknown[]) {
        mocks.not(...args);
        return this;
      },
      gte(...args: unknown[]) {
        mocks.gte(...args);
        return Promise.resolve({ count: mocks.count, error: mocks.countError });
      },
      maybeSingle: async () => ({
        data:
          table === "profiles"
            ? { role: mocks.role }
            : mocks.missing
              ? null
              : { kind: mocks.kind, finished_at: mocks.finishedAt },
      }),
    }),
  }),
}));
vi.mock("@/lib/marking/engine", () => ({ finishSession: mocks.finish }));
import { POST } from "./route";
const finish = () =>
  POST(new Request("http://localhost/api", { method: "POST" }), {
    params: Promise.resolve({ id: "s" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.kind = "sprint";
  mocks.finishedAt = null;
  mocks.role = "student";
  mocks.count = 0;
  mocks.countError = null;
  mocks.signedIn = true;
  mocks.missing = false;
  mocks.rate.mockResolvedValue({ ok: true });
  mocks.finish.mockResolvedValue({ score: 2, max_score: 4, summary: null });
});
it.each(["sprint", "flashcards"])(
  "finishes %s using the shared engine",
  async (kind) => {
    mocks.kind = kind;
    const response = await finish();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      score: 2,
      max_score: 4,
      summary: null,
      finished: true,
    });
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("s");
  },
);
it("returns not found for a legacy paper row without calling the engine", async () => {
  mocks.kind = "paper";
  const response = await finish();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Session not found" });
  expect(mocks.finish).not.toHaveBeenCalled();
});
it("keeps single checks on their own submission flow", async () => {
  mocks.kind = "single";
  expect((await finish()).status).toBe(409);
  expect(mocks.finish).not.toHaveBeenCalled();
});

it("checks the student AI allowance before marking", async () => {
  mocks.rate.mockResolvedValueOnce({
    ok: false,
    error: "You're going a bit fast, try again in a minute",
    retryAfterSec: 60,
  });
  const response = await finish();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(await response.json()).toEqual({
    error: "You're going a bit fast, try again in a minute",
  });
  expect(mocks.rate).toHaveBeenCalledExactlyOnceWith({
    userId: "u",
    role: "student",
  });
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(mocks.gte).not.toHaveBeenCalled();
});
it("allows the final daily sprint and counts finished written sessions since Sydney midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
  try {
    mocks.count = 199;
    expect((await finish()).status).toBe(200);
    expect(mocks.select).toHaveBeenCalledWith(
      "id,attempts!inner(questions!inner(type))",
      { count: "exact", head: true },
    );
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "u");
    expect(mocks.eq).toHaveBeenCalledWith("kind", "sprint");
    expect(mocks.neq).toHaveBeenCalledWith("attempts.questions.type", "mcq");
    expect(mocks.not).toHaveBeenCalledWith("finished_at", "is", null);
    expect(mocks.gte).toHaveBeenCalledWith(
      "finished_at",
      "2026-10-19T13:00:00.000Z",
    );
  } finally {
    vi.useRealTimers();
  }
});
it.each([200, 201])(
  "blocks daily written sprint count %i before marking",
  async (count) => {
    mocks.count = count;
    const response = await finish();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("86400");
    expect(await response.json()).toEqual({
      error: "You've reached today's sprint limit. Try again tomorrow.",
    });
    expect(mocks.finish).not.toHaveBeenCalled();
  },
);
it("exempts admins from the daily cap and passes their trusted role to the AI limiter", async () => {
  mocks.role = "admin";
  mocks.count = 200;
  expect((await finish()).status).toBe(200);
  expect(mocks.rate).toHaveBeenCalledWith({ userId: "u", role: "admin" });
  expect(mocks.gte).not.toHaveBeenCalled();
});
it.each(["sprint", "flashcards"])(
  "returns saved %s results without rate limiting",
  async (kind) => {
    mocks.kind = kind;
    mocks.finishedAt = "2026-10-20T00:00:00Z";
    mocks.count = 200;
    expect((await finish()).status).toBe(200);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.gte).not.toHaveBeenCalled();
  },
);
it("finishes self-rated flashcards without an AI allowance", async () => {
  mocks.kind = "flashcards";
  expect((await finish()).status).toBe(200);
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(mocks.gte).not.toHaveBeenCalled();
});
it("does not mark when the daily count fails", async () => {
  mocks.countError = new Error("Count unavailable");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await finish()).status).toBe(500);
    expect(mocks.finish).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
it("requires authentication before checking limits", async () => {
  mocks.signedIn = false;
  expect((await finish()).status).toBe(401);
  expect(mocks.rate).not.toHaveBeenCalled();
});
it("requires an owned session before checking limits", async () => {
  mocks.missing = true;
  expect((await finish()).status).toBe(404);
  expect(mocks.rate).not.toHaveBeenCalled();
});
