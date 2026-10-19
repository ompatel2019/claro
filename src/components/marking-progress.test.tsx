import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkingProgress } from "./marking-progress";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("announces mixed progress and completion, stopping when only failures remain", () => {
  vi.useFakeTimers();
  const { rerender } = render(
    <MarkingProgress done={18} total={21} marking={1} attention={2} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "18 of 21 marked · 2 need attention. 1 still marking.",
  );
  act(() => vi.advanceTimersByTime(2000));
  expect(refresh).toHaveBeenCalledTimes(1);
  rerender(<MarkingProgress done={19} total={21} marking={0} attention={2} />);
  expect(screen.getByRole("status")).toHaveTextContent("Marking complete.");
  act(() => vi.advanceTimersByTime(10000));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("does not poll a settled sit", () => {
  vi.useFakeTimers();
  render(<MarkingProgress done={18} total={20} marking={0} attention={2} />);
  act(() => vi.advanceTimersByTime(10000));
  expect(refresh).not.toHaveBeenCalled();
});
it("backs off after 30 seconds and cancels polling on unmount", () => {
  vi.useFakeTimers();
  const { unmount } = render(
    <MarkingProgress done={1} total={3} marking={2} attention={0} />,
  );
  act(() => vi.advanceTimersByTime(33000));
  const calls = refresh.mock.calls.length;
  act(() => vi.advanceTimersByTime(4000));
  expect(refresh).toHaveBeenCalledTimes(calls + 1);
  unmount();
  act(() => vi.advanceTimersByTime(10000));
  expect(refresh).toHaveBeenCalledTimes(calls + 1);
});

it("keeps refreshing an in-progress page after everything is marked, until the server render changes", () => {
  vi.useFakeTimers();
  render(
    <MarkingProgress done={3} total={3} marking={0} attention={0} inProgress />,
  );
  // Immediate refresh when the marked count hits the total.
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Finishing your results…")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(2000));
  expect(refresh).toHaveBeenCalledTimes(2);
  act(() => vi.advanceTimersByTime(4000));
  expect(refresh).toHaveBeenCalledTimes(4);
});
it("refreshes when the last answer is marked, then backs off and stops after 10 minutes", () => {
  vi.useFakeTimers();
  const { rerender } = render(
    <MarkingProgress done={2} total={3} marking={1} attention={0} inProgress />,
  );
  expect(refresh).not.toHaveBeenCalled();
  rerender(
    <MarkingProgress done={3} total={3} marking={0} attention={0} inProgress />,
  );
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(10 * 60_000 + 10_000));
  const calls = refresh.mock.calls.length;
  expect(calls).toBeGreaterThan(50);
  expect(calls).toBeLessThan(160);
  act(() => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(calls);
});
it("finishes the session itself once, 15 s after all answers are marked, then refreshes", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MarkingProgress
      done={3}
      total={3}
      marking={0}
      attention={0}
      inProgress
      sessionId="sess-1"
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(14_000));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1_500));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/sessions/sess-1/finish", {
    method: "POST",
  });
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
it("does not finish the session while answers are still marking or off the in-progress state", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(
    <MarkingProgress
      done={2}
      total={3}
      marking={1}
      attention={0}
      inProgress
      sessionId="s"
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  rerender(
    <MarkingProgress
      done={3}
      total={3}
      marking={0}
      attention={0}
      sessionId="s"
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
