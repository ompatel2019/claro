// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  admin: vi.fn(),
  markOwnCheck: vi.fn(),
  markBankCheck: vi.fn(),
  markAttempt: vi.fn(),
  transcribeImage: vi.fn(),
  singleSlotIds: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ ...mocks, auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.admin }));
vi.mock("@/lib/single-check", () => ({ singleSlotIds: mocks.singleSlotIds }));
vi.mock("@/lib/single-check-marking", () => ({
  markOwnCheck: mocks.markOwnCheck,
  markBankCheck: mocks.markBankCheck,
}));
vi.mock("@/lib/marking/engine", () => ({
  AlreadyMarking: class extends Error {},
  markAttempt: mocks.markAttempt,
  rescoreSession: vi.fn(),
  transcribeImage: mocks.transcribeImage,
}));
vi.mock("@/lib/ai/usage-context", () => ({ withAttemptUsage: vi.fn() }));
vi.mock("@/lib/ai/rate-limit", () => ({
  assertStudentAiRateLimit: mocks.rateLimit,
  rateLimitedResponse: () =>
    Response.json({ error: "Rate limited" }, { status: 429 }),
}));
import { POST as mark } from "./mark/route";
import { POST as transcribe } from "./transcribe/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  for (const fn of [mocks.from, mocks.select, mocks.eq])
    fn.mockReturnValue(mocks);
  mocks.singleSlotIds.mockResolvedValue(["session"]);
  mocks.rateLimit.mockResolvedValue({ ok: false, error: "Rate limited" });
});
afterEach(() => vi.unstubAllEnvs());

for (const [name, post] of [
  ["mark", mark],
  ["transcribe", transcribe],
] as const) {
  const call = (question_id: string | null = null) => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        session_id: "session",
        question_id,
        status: "pending",
        image_paths: ["owner/photo.png"],
        question: question_id
          ? { type: "short", stem: "Explain inflation" }
          : null,
        session: {
          kind: "single",
          started_at: "2026-10-14T00:00:00Z",
          finished_at: name === "mark" ? "2026-10-14T00:01:00Z" : null,
          config: { question: { stem: "Explain inflation" } },
        },
      },
    });
    return post(
      new Request(`http://localhost/api/attempts/attempt/${name}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "attempt" }) },
    );
  };
  it.each([undefined, "false", "TRUE"])(
    `${name} rejects saved own attempts with flag %s before paid work`,
    async (flag) => {
      vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", flag);
      const response = await call();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: expect.stringContaining(
          "Own-question marking is currently unavailable",
        ),
      });
      expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
      for (const fn of [
        mocks.admin,
        mocks.singleSlotIds,
        mocks.rateLimit,
        mocks.markOwnCheck,
        mocks.markBankCheck,
        mocks.markAttempt,
        mocks.transcribeImage,
      ])
        expect(fn).not.toHaveBeenCalled();
    },
  );
  it(`${name} lets enabled own attempts reach the normal rate limit`, async () => {
    vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", "true");
    // Marking records rate-limit failures for singles.
    mocks.admin.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({ in: () => ({ throwOnError: async () => ({}) }) }),
          }),
        }),
      }),
    });
    expect((await call()).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith({ userId: "owner" });
  });
  it(`${name} lets bank attempts reach the normal rate limit while the flag is off`, async () => {
    vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", "false");
    mocks.admin.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({ in: () => ({ throwOnError: async () => ({}) }) }),
          }),
        }),
      }),
    });
    expect((await call("bank-question")).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith({ userId: "owner" });
  });
}
