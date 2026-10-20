import type { TransitionStartFunction } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ undo: vi.fn(), error: vi.fn() }));
vi.mock("@/app/admin/content/questions/actions", () => ({
  undoQuestionChanges: mocks.undo,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
import { questionUndoCallback } from "./admin-question-undo";

beforeEach(() => vi.resetAllMocks());

it("defers undo to the caller's transition and refreshes after it succeeds", async () => {
  const undo = [
    {
      id: "question-1",
      expected: "2026-10-20T00:00:00Z",
      status: "draft" as const,
      topic_id: "topic-1",
      verb: null,
      duplicate_of: null,
    },
  ];
  const refresh = vi.fn();
  const start = vi.fn<TransitionStartFunction>();
  let resolve!: () => void;
  mocks.undo.mockReturnValue(new Promise<void>((done) => (resolve = done)));
  const callback = questionUndoCallback(undo, start, refresh);
  callback();
  expect(start).toHaveBeenCalledOnce();
  expect(mocks.undo).not.toHaveBeenCalled();
  const completion = start.mock.calls[0][0]();
  expect(mocks.undo).toHaveBeenCalledExactlyOnceWith(undo);
  expect(refresh).not.toHaveBeenCalled();
  resolve();
  await completion;
  expect(refresh).toHaveBeenCalledOnce();
  expect(mocks.error).not.toHaveBeenCalled();
});

it("shows the existing failure toast without refreshing when undo fails", async () => {
  mocks.undo.mockRejectedValue(new Error("A question changed."));
  const refresh = vi.fn();
  const start = vi.fn<TransitionStartFunction>();
  questionUndoCallback([], start, refresh)();
  await start.mock.calls[0][0]();
  expect(refresh).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith(
    "Couldn't undo. Reload and try again.",
  );
});
