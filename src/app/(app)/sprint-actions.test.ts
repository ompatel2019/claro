import { beforeEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => ({ rpc }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
import { startSprint } from "./actions";
import { DEFAULTS } from "@/lib/sprint";
const form = (config: unknown) => {
  const f = new FormData();
  f.set("config", JSON.stringify(config));
  return f;
};
beforeEach(() => rpc.mockReset());
it.each([0, -1, 10.25, Infinity])(
  "rejects invalid pace %s before selection",
  async (pace) => {
    expect(
      await startSprint({}, form({ ...DEFAULTS, short_min_per_mark: pace })),
    ).toHaveProperty("error");
    expect(
      await startSprint({}, form({ ...DEFAULTS, mcq_min_per_q: pace })),
    ).toHaveProperty("error");
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("passes decimal pace and its boundaries to the selector", async () => {
  rpc.mockResolvedValue({ data: "synthetic-session", error: null });
  await expect(
    startSprint(
      {},
      form({ ...DEFAULTS, short_min_per_mark: 0.25, mcq_min_per_q: 10 }),
    ),
  ).rejects.toThrow("/student/sprint/synthetic-session");
  expect(rpc).toHaveBeenCalledWith("start_sprint", {
    p_config: expect.objectContaining({
      short_min_per_mark: 0.25,
      mcq_min_per_q: 10,
      on_timeout: "overtime",
    }),
  });
});
it("defaults missing pace and reports an empty pool", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "no questions match" },
  });
  expect(await startSprint({}, form({ mode: "mcq" }))).toEqual({
    error: "No questions match these settings.",
  });
  expect(rpc).toHaveBeenCalledWith("start_sprint", {
    p_config: expect.objectContaining({
      short_min_per_mark: 1.5,
      mcq_min_per_q: 1,
    }),
  });
});
it("reports a selection error without starting a session", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "invalid sprint pace" },
  });
  expect(await startSprint({}, form(DEFAULTS))).toEqual({
    error: "Check your sprint settings.",
  });
});
