// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  calls: [] as unknown[][],
  claimed: [] as { id: string }[],
  session: null as { finished_at: string | null } | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    from: (table: string) => {
      let updating = false;
      const chain: Record<string, unknown> = {};
      for (const method of ["update", "select", "eq", "is", "or"])
        chain[method] = (...args: unknown[]) => {
          if (method === "update") updating = true;
          mocks.calls.push([method, ...args]);
          return chain;
        };
      chain.maybeSingle = () => chain;
      chain.throwOnError = async () => {
        mocks.calls.push(["run", table]);
        return { data: updating ? mocks.claimed : mocks.session };
      };
      return chain;
    },
  }),
}));
import { FINISH_LEASE_MS } from "@/lib/results";
import { FinishInProgress, claimFinish, releaseFinish } from "./finish-claim";

const now = Date.parse("2026-10-24T02:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ now });
  mocks.calls = [];
  mocks.claimed = [{ id: "s" }];
  mocks.session = { finished_at: null };
});

it("claims only the student's open sprint with no live lease", async () => {
  expect(await claimFinish("s", "u")).toBe("2026-10-24T02:00:00.000Z");
  const stale = new Date(now - FINISH_LEASE_MS).toISOString();
  expect(mocks.calls).toEqual([
    ["update", { finish_requested_at: "2026-10-24T02:00:00.000Z" }],
    ["eq", "id", "s"],
    ["eq", "user_id", "u"],
    ["is", "finished_at", null],
    ["or", `finish_requested_at.is.null,finish_requested_at.lt.${stale}`],
    ["select", "id"],
    ["run", "sessions"],
  ]);
  expect(FINISH_LEASE_MS).toBeGreaterThan(300_000);
});

it("returns null for a finished sprint and throws while another run holds it", async () => {
  mocks.claimed = [];
  mocks.session = { finished_at: "2026-10-24T01:59:00Z" };
  expect(await claimFinish("s", "u")).toBeNull();
  expect(mocks.calls.slice(-4)).toEqual([
    ["select", "finished_at"],
    ["eq", "id", "s"],
    ["eq", "user_id", "u"],
    ["run", "sessions"],
  ]);
  mocks.session = { finished_at: null };
  await expect(claimFinish("s", "u")).rejects.toBeInstanceOf(FinishInProgress);
});

it("releases only its own claim on a still-open sprint", async () => {
  await releaseFinish("s", "claim-1");
  expect(mocks.calls).toEqual([
    ["update", { finish_requested_at: null }],
    ["eq", "id", "s"],
    ["eq", "finish_requested_at", "claim-1"],
    ["is", "finished_at", null],
    ["run", "sessions"],
  ]);
});
