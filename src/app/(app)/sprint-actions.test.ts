import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireProfile: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/env/client", () => ({ clientEnv: {} }));
import { startSprint } from "./actions";
import { DEFAULTS } from "@/lib/sprint";
const form = (config: unknown) => {
  const f = new FormData();
  f.set("config", JSON.stringify(config));
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: "synthetic-session", error: null });
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
    form({ ...DEFAULTS, mode: "mixed", include_extended: true }),
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
