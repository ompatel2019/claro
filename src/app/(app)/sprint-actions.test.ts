import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireProfile: vi.fn(),
  redirect: vi.fn(),
  after: vi.fn(),
  finishOpenSessions: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/session-finish", () => ({
  finishOpenSessions: mocks.finishOpenSessions,
}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/env/client", () => ({ clientEnv: {} }));
import { startSprint } from "./actions";
import { DEFAULTS, withMode } from "@/lib/sprint";
const form = (config: unknown) => {
  const f = new FormData();
  f.set("config", JSON.stringify(config));
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireProfile.mockResolvedValue({ id: "synthetic-student" });
  mocks.rpc.mockResolvedValue({ data: "synthetic-session", error: null });
});
it("finishes the student's other open sessions after starting (no resume)", async () => {
  await startSprint({}, form(DEFAULTS));
  expect(mocks.after).toHaveBeenCalledOnce();
  expect(mocks.finishOpenSessions).not.toHaveBeenCalled();
  await mocks.after.mock.calls[0][0]();
  expect(mocks.finishOpenSessions).toHaveBeenCalledWith("synthetic-student", {
    keep: "synthetic-session",
  });
});
it("rejects essay mode before selection", async () => {
  expect(
    await startSprint({}, form({ ...DEFAULTS, mode: "extended" })),
  ).toHaveProperty("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("discards the legacy essay toggle and starts mixed", async () => {
  await startSprint(
    {},
    form({ ...withMode(DEFAULTS, "mixed"), include_extended: true }),
  );
  expect(mocks.rpc.mock.calls[0][1].p_config).not.toHaveProperty(
    "include_extended",
  );
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/student/sprint/synthetic-session",
  );
});
it.each([
  ["no questions match", "No questions match these settings."],
  ["invalid mode", "Check your sprint settings."],
  ["connection failed", "Try again."],
])("handles RPC error %s", async (message, error) => {
  mocks.rpc.mockResolvedValue({ error: { message } });
  expect(await startSprint({}, form(DEFAULTS))).toEqual({ error });
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});
it("rejects unreadable settings and authenticates first", async () => {
  const f = new FormData();
  f.set("config", "{");
  expect(await startSprint({}, f)).toHaveProperty("error");
  expect(mocks.requireProfile).toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([0, -1, 10.25, Infinity])(
  "rejects invalid pace %s before selection",
  async (pace) => {
    expect(
      await startSprint({}, form({ ...DEFAULTS, short_min_per_mark: pace })),
    ).toHaveProperty("error");
    expect(
      await startSprint({}, form({ ...DEFAULTS, mcq_min_per_q: pace })),
    ).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it("passes decimal pace and its boundaries to the selector", async () => {
  await startSprint(
    {},
    form({ ...DEFAULTS, short_min_per_mark: 0.25, mcq_min_per_q: 10 }),
  );
  expect(mocks.rpc).toHaveBeenCalledWith("start_sprint", {
    p_config: expect.objectContaining({
      short_min_per_mark: 0.25,
      mcq_min_per_q: 10,
      on_timeout: "overtime",
    }),
  });
  expect(mocks.redirect).toHaveBeenCalledWith(
    "/student/sprint/synthetic-session",
  );
});
it("defaults missing pace and reports an empty pool", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "no questions match" },
  });
  expect(await startSprint({}, form({ mode: "mcq" }))).toEqual({
    error: "No questions match these settings.",
  });
  expect(mocks.rpc).toHaveBeenCalledWith("start_sprint", {
    p_config: expect.objectContaining({
      short_min_per_mark: 1.5,
      mcq_min_per_q: 1,
    }),
  });
});

it("old shuffled start requests are normalised to exam order", async () => {
  await startSprint({}, form({ ...DEFAULTS, order: "shuffled" }));
  expect(mocks.rpc.mock.calls[0][1].p_config.order).toBe("exam");
});

it.each([
  [-1, 31],
  [1.5, 28.5],
  [101, -71],
  [10, 10],
])(
  "rejects invalid mixed buckets %s + %s before RPC",
  async (mcq_count, short_marks) => {
    const config = {
      ...DEFAULTS,
      mode: "mixed",
      size_by: "marks",
      target: 30,
      mcq_count,
      short_count: undefined,
      short_marks,
    };
    expect(await startSprint({}, form(config))).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it.each([
  [0, 30],
  [15, 15],
  [30, 0],
])("passes a valid mixed split %s + %s", async (mcq_count, short_marks) => {
  await startSprint(
    {},
    form({
      ...DEFAULTS,
      mode: "mixed",
      size_by: "marks",
      target: 30,
      mcq_count,
      short_count: undefined,
      short_marks,
    }),
  );
  expect(mocks.rpc.mock.calls[0][1].p_config).toMatchObject({
    mcq_count,
    short_marks,
  });
});

it.each(["5", 0, 101, 2.5, {}, []])(
  "rejects invalid marks per short answer %s",
  async (marks_per_short) => {
    expect(
      await startSprint({}, form({ ...DEFAULTS, marks_per_short })),
    ).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it.each([null, "5", -1, 16, 2.5])(
  "rejects invalid short question count %s",
  async (short_count) => {
    expect(
      await startSprint(
        {},
        form({ ...withMode(DEFAULTS, "mixed"), short_count }),
      ),
    ).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it("validates new Mixed totals before RPC and sends the exact mark filter", async () => {
  const config = { ...withMode(DEFAULTS, "mixed"), marks_per_short: 5 };
  expect(await startSprint({}, form({ ...config, target: 3 }))).toHaveProperty(
    "error",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  await startSprint({}, form(config));
  expect(mocks.rpc.mock.calls[0][1].p_config).toMatchObject({
    short_count: 5,
    mcq_count: 10,
    marks_per_short: 5,
    target: 15,
  });
});
