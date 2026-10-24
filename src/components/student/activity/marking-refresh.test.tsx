import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  finished: [] as { id: string }[],
  calls: [] as unknown[][],
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => {
    const chain = {
      from: (...args: unknown[]) => (
        mocks.calls.push(["from", ...args]),
        chain
      ),
      select: (...args: unknown[]) => (
        mocks.calls.push(["select", ...args]),
        chain
      ),
      in: (...args: unknown[]) => (mocks.calls.push(["in", ...args]), chain),
      or: async (...args: unknown[]) => {
        mocks.calls.push(["or", ...args]);
        return { data: mocks.finished };
      },
    };
    return chain;
  },
}));
import { MAX_WAIT_MS, SLOW_REFRESH_MS } from "@/components/marking-progress";
import { MarkingRefresh } from "./marking-refresh";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.finished = [];
  mocks.calls = [];
});

it("calls onDone once a sprint being marked has finished or its Finish was released", async () => {
  vi.useFakeTimers();
  const onDone = vi.fn();
  render(<MarkingRefresh ids={["a", "b"]} onDone={onDone} />);
  await act(() => vi.advanceTimersByTimeAsync(SLOW_REFRESH_MS));
  expect(mocks.calls).toEqual([
    ["from", "sessions"],
    ["select", "id"],
    ["in", "id", ["a", "b"]],
    ["or", "finished_at.not.is.null,finish_requested_at.is.null"],
  ]);
  expect(onDone).not.toHaveBeenCalled();
  mocks.finished = [{ id: "a" }];
  await act(() => vi.advanceTimersByTimeAsync(SLOW_REFRESH_MS * 3));
  expect(onDone).toHaveBeenCalledOnce();
});

it("stops polling after the marking wait", async () => {
  vi.useFakeTimers();
  render(<MarkingRefresh ids={["a"]} onDone={() => {}} />);
  await act(() => vi.advanceTimersByTimeAsync(MAX_WAIT_MS + SLOW_REFRESH_MS));
  const polls = mocks.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(SLOW_REFRESH_MS * 5));
  expect(mocks.calls).toHaveLength(polls);
});
