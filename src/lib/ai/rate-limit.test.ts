// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), release: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    rpc: mocks.rpc,
    from: () => ({ delete: () => ({ eq: mocks.release }) }),
  }),
}));

import {
  AI_RATE_LIMIT_MESSAGE,
  AI_RATE_LIMIT_PER_MINUTE,
  AUTOFILL_RATE_LIMIT_MESSAGE,
  aiUsageReservationIds,
  assertStudentAiRateLimit,
  ensureAiUsageReservation,
  rateLimitedResponse,
  withAiUsageReservation,
  withDeferredAiUsageReservation,
} from "./rate-limit";

const userId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({
    data: { ok: true, reservationId: "r" },
    error: null,
  });
  mocks.release.mockResolvedValue({ error: null });
});
describe("assertStudentAiRateLimit", () => {
  it("reserves capacity with the server-derived user before allowing work", async () => {
    expect(await assertStudentAiRateLimit({ userId })).toEqual({
      ok: true,
      reservationId: "r",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_usage", {
      p_user: userId,
      p_scope: "student",
    });
  });

  it.each([60, 3600])(
    "keeps the rate-limit message and %i second retry",
    async (retryAfterSec) => {
      mocks.rpc.mockResolvedValue({
        data: { ok: false, retryAfterSec },
        error: null,
      });
      const result = await assertStudentAiRateLimit({ userId });
      expect(result).toEqual({
        ok: false,
        error: AI_RATE_LIMIT_MESSAGE,
        retryAfterSec,
      });
      if (result.ok) throw new Error("Expected refusal");
      const response = rateLimitedResponse(result);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(String(retryAfterSec));
      expect(await response.json()).toEqual({ error: AI_RATE_LIMIT_MESSAGE });
    },
  );

  it("preserves the autofill daily message", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: false, retryAfterSec: 86400 },
      error: null,
    });
    expect(
      await assertStudentAiRateLimit({ userId, scope: "autofill" }),
    ).toEqual({
      ok: false,
      error: AUTOFILL_RATE_LIMIT_MESSAGE,
      retryAfterSec: 86400,
    });
  });

  it("exempts known admins even during a DB outage", async () => {
    expect(await assertStudentAiRateLimit({ userId, role: "admin" })).toEqual({
      ok: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts the database-confirmed admin exemption", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, adminExempt: true },
      error: null,
    });
    expect(await assertStudentAiRateLimit({ userId })).toEqual({ ok: true });
  });

  it.each([
    "returned error",
    "thrown error",
    "missing result",
    "invalid result",
    "missing reservation",
  ])("fails closed for %s", async (kind) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    if (kind === "thrown error")
      mocks.rpc.mockRejectedValue(new Error("db down"));
    else
      mocks.rpc.mockResolvedValue({
        data:
          kind === "invalid result"
            ? { ok: "true" }
            : kind === "missing reservation"
              ? { ok: true }
              : null,
        error: kind === "returned error" ? { message: "db down" } : null,
      });
    expect(await assertStudentAiRateLimit({ userId })).toEqual({
      ok: false,
      error: AI_RATE_LIMIT_MESSAGE,
      retryAfterSec: 60,
    });
    spy.mockRestore();
  });

  it("parallel requests cannot start more paid work than reserved capacity", async () => {
    let pending = 0;
    mocks.rpc.mockImplementation(async () => {
      // Simulates the serialized SQL critical section; no provider has finished.
      await Promise.resolve();
      return {
        data:
          pending >= AI_RATE_LIMIT_PER_MINUTE
            ? { ok: false, retryAfterSec: 60 }
            : { ok: true, reservationId: `r-${++pending}` },
        error: null,
      };
    });
    const provider = vi.fn(async () => {
      await Promise.resolve();
    });
    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const result = await assertStudentAiRateLimit({ userId });
        if (result.ok) await withAiUsageReservation(result, provider);
        return result.ok;
      }),
    );
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(provider).toHaveBeenCalledTimes(20);
    expect(mocks.release).toHaveBeenCalledTimes(20);
  });
});

it("isolates parallel contexts and includes nested daily reservations", async () => {
  const result = await Promise.all(
    ["a", "b"].map((id) =>
      withAiUsageReservation({ ok: true, reservationId: id }, async () => {
        await Promise.resolve();
        return withAiUsageReservation(
          { ok: true, reservationId: `${id}-daily` },
          async () => aiUsageReservationIds(),
        );
      }),
    ),
  );
  expect(result).toEqual([
    ["a", "a-daily"],
    ["b", "b-daily"],
  ]);
  expect(aiUsageReservationIds()).toEqual([]);
});

it("releases unused capacity on a failure", async () => {
  await expect(
    withAiUsageReservation({ ok: true, reservationId: "r" }, async () => {
      throw new Error("provider down");
    }),
  ).rejects.toThrow("provider down");
  expect(mocks.release).toHaveBeenCalledWith("id", "r");
  expect(aiUsageReservationIds()).toEqual([]);
});

it("does not hide a successful result if cleanup fails (TTL is the fallback)", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.release.mockResolvedValue({ error: { message: "db down" } });
  await expect(
    withAiUsageReservation({ ok: true, reservationId: "r" }, async () => 42),
  ).resolves.toBe(42);
  spy.mockRestore();
});

it("isolates deferred Finish reservations across concurrent requests", async () => {
  const result = await Promise.all(
    ["a", "b"].map((id) => {
      const reserve = vi.fn(async () => ({
        ok: true as const,
        reservationId: id,
      }));
      return withDeferredAiUsageReservation(
        reserve,
        async () => {},
        async () => {
          await Promise.all([
            ensureAiUsageReservation(),
            ensureAiUsageReservation(),
          ]);
          expect(reserve).toHaveBeenCalledTimes(1);
          return aiUsageReservationIds();
        },
      );
    }),
  );
  expect(result).toEqual([["a"], ["b"]]);
  expect(aiUsageReservationIds()).toEqual([]);
  expect(mocks.release).toHaveBeenCalledTimes(2);
});
