// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  ownAttempt: vi.fn(),
  explanation: vi.fn(),
  mark: vi.fn(),
  rescore: vi.fn(),
  adminFrom: vi.fn(),
  rpc: vi.fn(),
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
  admin: () => ({ from: mocks.adminFrom, rpc: mocks.rpc }),
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
vi.mock("@/lib/ai/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/ai/rate-limit")>()),
  assertStudentAiRateLimit: mocks.rate,
  rateLimitedResponse: vi.fn(),
}));
import { PATCH, POST } from "./route";
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
  mocks.rpc.mockImplementation((_name, p) =>
    mocks
      .adminFrom("attempts")
      .update(p.p_patch)
      .eq("status", p.p_status)
      .eq("answer_version", p.p_version)
      .select("id")
      .then((r: { data: unknown[] }) => ({ data: Boolean(r.data?.length) })),
  );
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

function saveQuery(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data }),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data }).then(resolve);
    },
  };
  for (const key of ["select", "eq", "is", "update"] as const)
    chain[key].mockReturnValue(chain);
  return chain;
}
const savedAttempt = {
  answer_text: "The prices rise rapidly",
  transcript: null,
  image_paths: null,
  status: "marked",
  answer_version: 3,
  session: { kind: "sprint", config: { feedback: "end" }, finished_at: null },
  question: { type: "short" },
};
const patchAnswer = (patch: unknown) =>
  PATCH(
    new Request("https://example.test", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
    { params: Promise.resolve({ id: "a" }) },
  );

it.each(["marked", "marking", "failed"])(
  "editing a %s answer clears its mark and claim",
  async (status) => {
    const load = saveQuery({ ...savedAttempt, status });
    const save = saveQuery([{ id: "a" }]);
    mocks.adminFrom.mockReturnValueOnce(load).mockReturnValueOnce(save);
    expect(
      (await patchAnswer({ answer_text: "Demand falls instead" })).status,
    ).toBe(200);
    expect(load.eq).toHaveBeenCalledWith("user_id", "u");
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({
        answer_text: "Demand falls instead",
        status: "pending",
        mark: null,
        feedback: null,
        check_status: "skipped",
        claimed_at: null,
      }),
    );
    expect(save.eq).toHaveBeenCalledWith("status", status);
    expect(save.eq).toHaveBeenCalledWith(
      "answer_version",
      savedAttempt.answer_version,
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_sprint_answer",
      expect.objectContaining({
        p_id: "a",
        p_user: "u",
        p_version: 3,
        p_status: status,
      }),
    );
  },
);

it("saving unchanged text or a flag preserves a completed mark", async () => {
  const save = saveQuery([{ id: "a" }]);
  mocks.adminFrom
    .mockReturnValueOnce(saveQuery(savedAttempt))
    .mockReturnValueOnce(save);
  expect(
    (
      await patchAnswer({
        answer_text: savedAttempt.answer_text,
        flagged: true,
      })
    ).status,
  ).toBe(200);
  expect(save.update).toHaveBeenCalledExactlyOnceWith({
    answer_text: savedAttempt.answer_text,
    flagged: true,
  });
});

it.each([
  null,
  {
    ...savedAttempt,
    session: { ...savedAttempt.session, finished_at: "done" },
  },
  { ...savedAttempt, session: { ...savedAttempt.session, kind: "single" } },
  {
    ...savedAttempt,
    session: { ...savedAttempt.session, config: { feedback: "each" } },
  },
  { ...savedAttempt, question: { type: "mcq" } },
])(
  "rejects saves outside editable end-feedback written sprints (%j)",
  async (row) => {
    mocks.adminFrom.mockReturnValueOnce(saveQuery(row));
    expect((await patchAnswer({ answer_text: "new" })).status).toBe(
      row ? 409 : 404,
    );
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1);
  },
);

it.each([
  { status: "marked" },
  { user_id: "someone" },
  { mark: 4 },
  { choice_index: 0 },
  { answer_text: 3 },
])("rejects non-answer patches (%j)", async (patch) => {
  expect((await patchAnswer(patch)).status).toBe(400);
  expect(mocks.adminFrom).not.toHaveBeenCalled();
});
it("requires authentication for saves", async () => {
  mocks.user.mockResolvedValue({ data: { user: null } });
  expect((await patchAnswer({ answer_text: "new" })).status).toBe(401);
  expect(mocks.adminFrom).not.toHaveBeenCalled();
});
it("retries a save if a mark completes after reading the snapshot", async () => {
  const conflict = saveQuery([]);
  const save = saveQuery([{ id: "a" }]);
  mocks.adminFrom
    .mockReturnValueOnce(saveQuery({ ...savedAttempt, status: "marking" }))
    .mockReturnValueOnce(conflict)
    .mockReturnValueOnce(saveQuery(savedAttempt))
    .mockReturnValueOnce(save);
  expect((await patchAnswer({ transcript: "new transcript" })).status).toBe(
    200,
  );
  expect(conflict.eq).toHaveBeenCalledWith("status", "marking");
  expect(save.eq).toHaveBeenCalledWith("status", "marked");
});

it("returns a retryable conflict after three concurrent save conflicts", async () => {
  for (let i = 0; i < 3; i++)
    mocks.adminFrom
      .mockReturnValueOnce(saveQuery(savedAttempt))
      .mockReturnValueOnce(saveQuery([]));
  expect((await patchAnswer({ answer_text: "new" })).status).toBe(409);
  expect(mocks.adminFrom).toHaveBeenCalledTimes(6);
});

it("leaves version increments to the database and clears the superseded claim", async () => {
  const save = saveQuery([{ id: "a" }]);
  mocks.adminFrom
    .mockReturnValueOnce(saveQuery(savedAttempt))
    .mockReturnValueOnce(save);
  expect((await patchAnswer({ answer_text: "new" })).status).toBe(200);
  expect(save.update.mock.calls[0][0]).not.toHaveProperty("answer_version");
  expect(save.update.mock.calls[0][0].claimed_at).toBeNull();
});

it("rejects a save when Finish wins after the editable snapshot was read", async () => {
  mocks.adminFrom
    .mockReturnValueOnce(saveQuery(savedAttempt))
    .mockReturnValueOnce(
      saveQuery({
        ...savedAttempt,
        session: { ...savedAttempt.session, finished_at: "done" },
      }),
    );
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  const response = await patchAnswer({ answer_text: "new answer" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "This answer is no longer editable",
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it.each([
  "../victim/photo.png",
  "%2e%2e/photo.png",
  "..\\victim\\photo.png",
  "/photo.png",
])(
  "rejects unsafe saved image key %s before privileged access",
  async (suffix) => {
    expect((await patchAnswer({ image_paths: [`u/${suffix}`] })).status).toBe(
      400,
    );
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);

it("saves photos in the uploader's canonical format", async () => {
  const load = saveQuery(savedAttempt);
  const save = saveQuery([{ id: "a" }]);
  mocks.adminFrom.mockReturnValueOnce(load).mockReturnValueOnce(save);
  const image_paths = [
    "u/75f2a40b-3e20-4a56-9e14-1b237cfc8396-1729000000000-0.jpg",
  ];
  expect((await patchAnswer({ image_paths })).status).toBe(200);
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ image_paths }),
  );
});
