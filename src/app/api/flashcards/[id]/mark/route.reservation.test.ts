// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn<() => Promise<unknown>>(),
  from: vi.fn<(table: string) => unknown>(),
  openRouterSpend: vi.fn<() => Promise<number>>(),
  delete: vi.fn<(table: string) => void>(),
  eq: vi.fn<
    (table: string, column: string, id: string) => Promise<{ error: null }>
  >(),
  insert: vi.fn<(table: string, values: unknown) => void>(),
  assertStudentAiRateLimit:
    vi.fn<typeof import("@/lib/ai/rate-limit").assertStudentAiRateLimit>(),
  markFlashcard: vi.fn<typeof import("@/lib/marking/engine").markFlashcard>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/ai/rate-limit", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/ai/rate-limit")>()),
  assertStudentAiRateLimit: mocks.assertStudentAiRateLimit,
}));
vi.mock("@/lib/ai/spend", () => ({
  openRouterSpend: mocks.openRouterSpend,
}));
vi.mock("@/lib/marking/engine", () => ({
  markFlashcard: mocks.markFlashcard,
}));

import { BUDGET_USD } from "@/lib/ai/prices";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "card" }) };
const request = () =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ answer: "A different answer" }),
    headers: { "Content-Type": "application/json" },
  });

function query(data: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ["select", "eq", "single"])
    chain[key] = vi.fn<() => typeof chain>(() => chain);
  chain.maybeSingle = vi
    .fn<() => Promise<{ data: unknown }>>()
    .mockResolvedValue({ data });
  chain.throwOnError = vi
    .fn<() => Promise<{ data: unknown }>>()
    .mockResolvedValue({ data });
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn<() => Promise<unknown>>().mockResolvedValue({
        data: { user: { id: "user" } },
      }),
    },
    from: vi.fn<(table: string) => unknown>(() =>
      query({ kind: "term", front: "Front", back: "Back" }),
    ),
  });
  mocks.from.mockImplementation((table) => ({
    delete: () => {
      mocks.delete(table);
      return {
        eq: (column: string, id: string) => mocks.eq(table, column, id),
      };
    },
    insert: (values: unknown) => {
      mocks.insert(table, values);
      return query({ id: "review" });
    },
  }));
  mocks.eq.mockResolvedValue({ error: null });
  mocks.openRouterSpend.mockResolvedValue(BUDGET_USD - 1);
  mocks.assertStudentAiRateLimit.mockResolvedValue({
    ok: true,
    reservationId: "res-1",
  });
  mocks.markFlashcard.mockResolvedValue({ mark: 1, reason: "Correct" });
});
afterEach(() => vi.restoreAllMocks());

function expectReservationReleased() {
  expect(mocks.assertStudentAiRateLimit).toHaveBeenCalledExactlyOnceWith({
    userId: "user",
  });
  expect(mocks.openRouterSpend).toHaveBeenCalledOnce();
  expect(mocks.delete).toHaveBeenCalledExactlyOnceWith("ai_usage_reservations");
  expect(mocks.eq).toHaveBeenCalledExactlyOnceWith(
    "ai_usage_reservations",
    "id",
    "res-1",
  );
  expect(mocks.insert).not.toHaveBeenCalled();
}

it("releases the AI usage reservation when over budget returns 503", async () => {
  mocks.openRouterSpend.mockResolvedValue(BUDGET_USD);

  const response = await POST(request(), ctx);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Marking is paused right now. Rate yourself instead.",
  });
  expect(mocks.markFlashcard).not.toHaveBeenCalled();
  expectReservationReleased();
});

it("releases the AI usage reservation when a spend read error returns 500", async () => {
  mocks.openRouterSpend.mockRejectedValue(new Error("ai_spend failed: down"));

  const response = await POST(request(), ctx);

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not mark flashcard" });
  expect(mocks.markFlashcard).not.toHaveBeenCalled();
  expectReservationReleased();
});

it("releases the AI usage reservation when markFlashcard throws and returns 500", async () => {
  mocks.markFlashcard.mockRejectedValue(new Error("Marking failed"));

  const response = await POST(request(), ctx);

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not mark flashcard" });
  expect(mocks.markFlashcard).toHaveBeenCalledExactlyOnceWith(
    { kind: "term", front: "Front", back: "Back" },
    "A different answer",
    "user",
  );
  expectReservationReleased();
});
