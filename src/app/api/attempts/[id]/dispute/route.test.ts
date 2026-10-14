// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc }),
}));
import { POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const send = (
  body: unknown = { note: "Please check my evidence." },
  attempt = id,
) =>
  POST(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: attempt }) },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "synthetic" } } });
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
it("requires authentication before reading or writing", async () => {
  mocks.user.mockResolvedValue({ data: { user: null } });
  expect((await send()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([null, { note: "   " }, { note: "short" }, { note: "x".repeat(1001) }])(
  "rejects %j before the RPC",
  async (body) => {
    expect((await send(body)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it("rejects invalid attempt ids", async () => {
  expect((await send(undefined, "bad")).status).toBe(404);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("submits a trimmed written reason to the atomic RPC", async () => {
  expect((await send({ note: "  Please check my evidence.  " })).status).toBe(
    200,
  );
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("request_mark_review", {
    p_attempt: id,
    p_note: "Please check my evidence.",
  });
});
it.each([400, 404, 409])(
  "preserves database rejection status %i",
  async (status) => {
    mocks.rpc.mockResolvedValue({
      data: { error: "Guardrail", status },
      error: null,
    });
    const r = await send();
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ error: "Guardrail", status });
  },
);
it("returns a retryable failure without leaking database details", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "private database detail" },
  });
  const r = await send();
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({
    error: "Couldn't request a review. Try again.",
  });
});
