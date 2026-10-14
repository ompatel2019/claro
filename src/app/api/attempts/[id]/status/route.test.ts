// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ ...mocks, auth: { getUser: mocks.getUser } }),
}));
import { GET } from "./route";

const poll = () =>
  GET(new Request("http://localhost/api/attempts/attempt/status"), {
    params: Promise.resolve({ id: "attempt" }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  for (const fn of [mocks.from, mocks.select, mocks.eq])
    fn.mockReturnValue(mocks);
});

it("returns owner feedback without uncertainty or competing marks", async () => {
  const raw = {
    status: "marked",
    mark: 3,
    max_marks: 4,
    band: "Sound",
    feedback: { comments: [], flags: { uncertain: true, marks: [3, 1] } },
  };
  mocks.maybeSingle.mockResolvedValue({ data: raw, error: null });
  const response = await poll();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ...raw, feedback: { comments: [] } });
  expect(raw.feedback.flags).toEqual({ uncertain: true, marks: [3, 1] });
  expect(mocks.eq.mock.calls).toEqual([
    ["id", "attempt"],
    ["user_id", "owner"],
  ]);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

it("rejects anonymous callers without querying attempts", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await poll()).status).toBe(401);
  expect(mocks.from).not.toHaveBeenCalled();
});

it("does not return missing or another owner's attempt", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await poll()).status).toBe(404);
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
});

it("does not expose query errors or feedback on failure", async () => {
  mocks.maybeSingle.mockResolvedValue({
    data: null,
    error: { message: "private" },
  });
  const response = await poll();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not load attempt" });
});
