// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn(), rpc: vi.fn() };
  return { admin: () => client };
});
vi.mock("@/lib/ai/rate-limit", () => ({
  assertStudentAiRateLimit: vi.fn(async () => ({ ok: true })),
  withAiUsageReservation: vi.fn(
    async (_r: unknown, work: () => Promise<unknown>) => work(),
  ),
  rateLimitedResponse: () => Response.json({}, { status: 429 }),
}));
vi.mock("@/lib/marking/engine", () => ({ markFlashcard: vi.fn() }));

import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import { markFlashcard } from "@/lib/marking/engine";
import { BUDGET_USD } from "@/lib/ai/prices";
import { withAiUsageReservation } from "@/lib/ai/rate-limit";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "card" }) };
const request = (answer: string) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ answer }),
    headers: { "Content-Type": "application/json" },
  });

function query(data: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ["select", "eq", "insert", "single"])
    chain[key] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data });
  chain.throwOnError = vi.fn().mockResolvedValue({ data });
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }),
    },
    from: vi.fn(() => query({ kind: "term", front: "Front", back: "Back" })),
  } as never);
  vi.mocked(admin().from).mockReturnValue(query({ id: "review" }) as never);
  vi.mocked(markFlashcard).mockResolvedValue({ mark: 1, reason: "Correct" });
});
afterEach(() => vi.restoreAllMocks());

it("marks with AI just below the total AI budget", async () => {
  vi.mocked(admin().rpc).mockResolvedValue({
    data: BUDGET_USD - 0.0001,
    error: null,
  } as never);
  const response = await POST(request("A different answer"), ctx);
  expect(response.status).toBe(200);
  expect(admin().rpc).toHaveBeenCalledWith("ai_spend");
  expect(markFlashcard).toHaveBeenCalledOnce();
});

it("refuses AI marking at the total AI budget without calling the model", async () => {
  vi.mocked(admin().rpc).mockResolvedValue({
    data: BUDGET_USD,
    error: null,
  } as never);
  const response = await POST(request("A different answer"), ctx);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Marking is paused right now. Rate yourself instead.",
  });
  expect(markFlashcard).not.toHaveBeenCalled();
  expect(admin().from).not.toHaveBeenCalled();
});

it("checks spend inside the usage reservation when over budget", async () => {
  vi.mocked(admin().rpc).mockResolvedValue({
    data: BUDGET_USD + 1,
    error: null,
  } as never);
  vi.mocked(withAiUsageReservation).mockImplementationOnce(async (_r, work) => {
    expect(admin().rpc).not.toHaveBeenCalled();
    const result = await work();
    expect(admin().rpc).toHaveBeenCalledWith("ai_spend");
    return result;
  });
  const response = await POST(request("A different answer"), ctx);
  expect(response.status).toBe(503);
  expect(withAiUsageReservation).toHaveBeenCalledOnce();
  expect(markFlashcard).not.toHaveBeenCalled();
  expect(admin().from).not.toHaveBeenCalled();
});

it("fails closed when the total AI spend cannot be read", async () => {
  vi.mocked(admin().rpc).mockResolvedValue({
    data: null,
    error: { message: "down" },
  } as never);
  const response = await POST(request("A different answer"), ctx);
  expect(response.status).toBe(500);
  expect(markFlashcard).not.toHaveBeenCalled();
});

it("does not check the budget for a local exact match", async () => {
  vi.mocked(admin().rpc).mockResolvedValue({
    data: BUDGET_USD,
    error: null,
  } as never);
  const response = await POST(request("Back"), ctx);
  expect(response.status).toBe(200);
  expect(admin().rpc).not.toHaveBeenCalled();
  expect(markFlashcard).not.toHaveBeenCalled();
});
