// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  kind: "sprint",
  finishedAt: null as string | null,
  role: "student",
  count: 0,
  countError: null as Error | null,
  needsAi: vi.fn(),
  dailyCount: vi.fn(),
  signedIn: true,
  missing: false,
  finish: vi.fn(),
  rate: vi.fn(),
  release: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/rate-limit")>()),
  assertStudentAiRateLimit: mocks.rate,
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: () => ({ delete: () => ({ eq: mocks.release }) }) }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocks.signedIn ? { id: "u" } : null },
      }),
    },
    from: (table: string) => ({
      select() {
        return this;
      },
      eq() {
        return this;
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
vi.mock("@/lib/marking/finish-limits", () => ({
  sessionNeedsAi: mocks.needsAi,
  dailyAiSprintCount: mocks.dailyCount,
}));
vi.mock("@/lib/marking/engine", () => ({ finishSession: mocks.finish }));
import { POST } from "./route";
import {
  aiUsageReservationIds,
  ensureAiUsageReservation,
} from "@/lib/ai/rate-limit";
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
  mocks.needsAi.mockResolvedValue(true);
  mocks.dailyCount.mockImplementation(async () => {
    if (mocks.countError) throw mocks.countError;
    return mocks.count;
  });
  mocks.signedIn = true;
  mocks.missing = false;
  mocks.rate.mockResolvedValue({ ok: true });
  mocks.release.mockResolvedValue({ error: null });
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
  expect(mocks.dailyCount).not.toHaveBeenCalled();
});
it("allows the final daily sprint and counts finished written sessions since Sydney midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
  try {
    mocks.count = 199;
    expect((await finish()).status).toBe(200);
    expect(mocks.dailyCount).toHaveBeenCalledExactlyOnceWith(
      "u",
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
  expect(mocks.dailyCount).not.toHaveBeenCalled();
});
it.each(["sprint", "flashcards"])(
  "returns saved %s results without rate limiting",
  async (kind) => {
    mocks.kind = kind;
    mocks.finishedAt = "2026-10-20T00:00:00Z";
    mocks.count = 200;
    expect((await finish()).status).toBe(200);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.dailyCount).not.toHaveBeenCalled();
  },
);
it("finishes self-rated flashcards without an AI allowance", async () => {
  mocks.kind = "flashcards";
  expect((await finish()).status).toBe(200);
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(mocks.dailyCount).not.toHaveBeenCalled();
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

it.each(["MCQ-only", "mixed containing only MCQs", "blank written"])(
  "finishes %s with exhausted AI and daily allowances",
  async () => {
    mocks.needsAi.mockResolvedValue(false);
    mocks.count = 200;
    mocks.rate.mockResolvedValue({ ok: false, retryAfterSec: 60 });
    expect((await finish()).status).toBe(200);
    expect(mocks.needsAi).toHaveBeenCalledExactlyOnceWith("s", "u");
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.dailyCount).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("s");
  },
);
it("does not mark when the actual-attempt lookup fails", async () => {
  mocks.needsAi.mockRejectedValueOnce(new Error("Attempts unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await finish()).status).toBe(500);
    expect(mocks.finish).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it("carries one atomic reservation through engine marking and releases it", async () => {
  mocks.rate.mockResolvedValue({ ok: true, reservationId: "finish-slot" });
  mocks.finish.mockImplementationOnce(async () => {
    await Promise.all([ensureAiUsageReservation(), ensureAiUsageReservation()]);
    expect(aiUsageReservationIds()).toEqual(["finish-slot"]);
    expect(mocks.release).not.toHaveBeenCalled();
    return { score: 2, max_score: 4, summary: null };
  });
  expect((await finish()).status).toBe(200);
  expect(mocks.rate).toHaveBeenCalledTimes(1);
  expect(mocks.dailyCount).toHaveBeenCalledTimes(1);
  expect(mocks.release).toHaveBeenCalledWith("id", "finish-slot");
});

it.each(["allowed", "minute", "daily", "database"])(
  "guards an answer saved after the AI-need snapshot: %s",
  async (limit) => {
    mocks.needsAi.mockResolvedValue(false);
    mocks.rate.mockResolvedValue(
      limit === "minute"
        ? { ok: false, error: "Slow down", retryAfterSec: 60 }
        : { ok: true, reservationId: "late-slot" },
    );
    if (limit === "daily") mocks.count = 200;
    if (limit === "database") mocks.countError = new Error("Count unavailable");
    const paid = vi.fn();
    mocks.finish.mockImplementationOnce(async () => {
      // The engine reloaded a written answer after the route saw a blank.
      await ensureAiUsageReservation();
      paid();
      return { score: 2, max_score: 4, summary: null };
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await finish();
      expect(response.status).toBe(
        limit === "allowed" ? 200 : limit === "database" ? 500 : 429,
      );
      expect(paid).toHaveBeenCalledTimes(limit === "allowed" ? 1 : 0);
      expect(mocks.rate).toHaveBeenCalledTimes(1);
      if (limit !== "minute")
        expect(mocks.release).toHaveBeenCalledWith("id", "late-slot");
      if (limit === "minute")
        expect(response.headers.get("Retry-After")).toBe("60");
      if (limit === "daily")
        expect(response.headers.get("Retry-After")).toBe("86400");
    } finally {
      log.mockRestore();
    }
  },
);

it.each(["daily denial", "daily error", "engine error"])(
  "releases the Finish reservation on %s",
  async (failure) => {
    mocks.rate.mockResolvedValue({ ok: true, reservationId: "finish-slot" });
    if (failure === "daily denial") mocks.count = 200;
    if (failure === "daily error")
      mocks.countError = new Error("Count unavailable");
    if (failure === "engine error")
      mocks.finish.mockRejectedValueOnce(new Error("Engine unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await finish()).status).toBe(
        failure === "daily denial" ? 429 : 500,
      );
      expect(mocks.release).toHaveBeenCalledWith("id", "finish-slot");
    } finally {
      log.mockRestore();
    }
  },
);
