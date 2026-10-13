import { expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
import { loadProgress } from "./progress-data";
it("requests SQL aggregation with inclusive Sydney range dates, never limited raw rows", async () => {
  rpc.mockResolvedValue({
    data: { topics: [{ answered: 1501, sessions: 100 }] },
    error: null,
  });
  expect(await loadProgress("90", "2026-10-09")).toEqual({
    topics: [{ answered: 1501, sessions: 100 }],
  });
  expect(rpc).toHaveBeenLastCalledWith("student_progress", {
    p_from: "2026-07-12",
    p_to: "2026-10-09",
  });
  await loadProgress("all", "2026-10-09");
  expect(rpc).toHaveBeenLastCalledWith("student_progress", {
    p_from: null,
    p_to: "2026-10-09",
  });
});
it("does not turn an RPC error into zero totals", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  await expect(loadProgress("30", "2026-10-09")).rejects.toThrow(
    "Could not load progress",
  );
});
