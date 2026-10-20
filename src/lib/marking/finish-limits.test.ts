// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({ admin: () => mocks }));
import { reserveDailyAiSprint, sessionNeedsAi } from "./finish-limits";

beforeEach(() => vi.resetAllMocks());

it.each([true, false])(
  "checks owned AI work through the SQL predicate: %s",
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await sessionNeedsAi("s", "u")).toBe(data);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "session_needs_ai_finish",
      { p_session: "s", p_user: "u" },
    );
    expect(mocks.from).not.toHaveBeenCalled();
  },
);

it.each([null, [], {}])(
  "fails closed on malformed AI-need reply %j",
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(sessionNeedsAi("s", "u")).rejects.toThrow(
      "Invalid AI finish lookup result",
    );
  },
);

it("reserves daily capacity through the service RPC without loading historical answers", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ok: true, reservationId: "daily" },
    error: null,
  });
  expect(await reserveDailyAiSprint("u", "s")).toEqual({
    ok: true,
    reservationId: "daily",
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("reserve_ai_sprint", {
    p_user: "u",
    p_session: "s",
  });
  expect(mocks.from).not.toHaveBeenCalled();
});

it("preserves the daily denial", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ok: false, retryAfterSec: 86400 },
    error: null,
  });
  expect(await reserveDailyAiSprint("u", "s")).toEqual({
    ok: false,
    retryAfterSec: 86400,
    error: "You've reached today's sprint limit. Try again tomorrow.",
  });
});

it.each([
  { ok: true, adminExempt: true },
  { ok: true, alreadyFinished: true },
])("accepts the DB-confirmed exemption %j", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  expect(await reserveDailyAiSprint("u", "s")).toEqual({ ok: true });
});

it.each([null, {}, { ok: true }, { ok: false, retryAfterSec: 60 }])(
  "fails closed on malformed daily reply %j",
  async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(reserveDailyAiSprint("u", "s")).rejects.toThrow(
      "Invalid daily sprint reservation result",
    );
  },
);

it("propagates lookup failures before paid work", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: new Error("Database unavailable"),
  });
  await expect(sessionNeedsAi("s", "u")).rejects.toThrow(
    "Database unavailable",
  );
  await expect(reserveDailyAiSprint("u", "s")).rejects.toThrow(
    "Database unavailable",
  );
});
