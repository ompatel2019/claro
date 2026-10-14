// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  ownAttempt: vi.fn(),
  explanation: vi.fn(),
  mark: vi.fn(),
  rescore: vi.fn(),
  adminFrom: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: mocks.ownAttempt,
    }),
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: mocks.adminFrom }),
}));
vi.mock("@/lib/ai/usage-context", () => ({
  withAttemptUsage: (_id: string, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/marking/engine", () => ({
  markAttempt: mocks.mark,
  rescoreSession: mocks.rescore,
  AlreadyMarking: class extends Error {},
}));
vi.mock("@/lib/single-check", () => ({ singleSlotIds: vi.fn() }));
vi.mock("@/lib/single-check-marking", () => ({
  markOwnCheck: vi.fn(),
  markBankCheck: vi.fn(),
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  assertStudentAiRateLimit: mocks.rate,
  rateLimitedResponse: vi.fn(),
}));
import { POST } from "./route";
const structured = {
  concept: "A local content rule requires domestic inputs.",
  why_correct: "Imported inputs fall.",
  distractors: { A: "Not a tariff.", B: "Not a subsidy.", D: "Not a quota." },
};
const attempt = (feedback = "each", finished_at: string | null = null) => ({
  session_id: "s",
  question_id: "q",
  question: { type: "mcq" },
  session: { kind: "sprint", config: { feedback }, finished_at },
});
const send = () =>
  POST(new Request("https://example.test", { method: "POST" }), {
    params: Promise.resolve({ id: "a" }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "u" } } });
  mocks.ownAttempt.mockResolvedValue({ data: attempt() });
  mocks.explanation.mockResolvedValue({
    data: { explanation: JSON.stringify(structured) },
  });
  mocks.adminFrom.mockReturnValue({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    single: mocks.explanation,
  });
  mocks.mark.mockResolvedValue({
    mark: 0,
    max_marks: 1,
    band: null,
    feedback: { correct_index: 2 },
    status: "marked",
  });
});
it("reveals structured and legacy fields only after the owned answer is marked", async () => {
  const response = await send();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    explanation: JSON.stringify(structured),
    structured_explanation: structured,
    correct_index: 2,
  });
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith("a");
  expect(mocks.adminFrom).toHaveBeenCalledExactlyOnceWith("questions");
  expect(mocks.rate).not.toHaveBeenCalled();
});
it.each(["Legacy explanation.", "{broken", null])(
  "preserves %s without inventing structured fields",
  async (explanation) => {
    mocks.explanation.mockResolvedValue({ data: { explanation } });
    const body = await (await send()).json();
    expect(body).not.toHaveProperty("structured_explanation");
    if (explanation) expect(body.explanation).toBe(explanation);
    else expect(body).not.toHaveProperty("explanation");
  },
);
it.each(["unauthenticated", "foreign", "end"])(
  "does not reveal explanations for %s attempts",
  async (state) => {
    if (state === "unauthenticated")
      mocks.user.mockResolvedValue({ data: { user: null } });
    if (state === "foreign") mocks.ownAttempt.mockResolvedValue({ data: null });
    if (state === "end")
      mocks.ownAttempt.mockResolvedValue({ data: attempt("end") });
    expect((await send()).status).toBe(
      state === "unauthenticated" ? 401 : state === "foreign" ? 404 : 409,
    );
    expect(mocks.mark).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  },
);
it("finished retries rescore without using the check-mode reveal path", async () => {
  mocks.ownAttempt.mockResolvedValue({ data: attempt("end", "2026-10-14") });
  const body = await (await send()).json();
  expect(body).not.toHaveProperty("explanation");
  expect(body).not.toHaveProperty("structured_explanation");
  expect(mocks.rescore).toHaveBeenCalledExactlyOnceWith("s");
});
