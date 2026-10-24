import { expect, it, vi } from "vitest";
import { createSprintMarkQueue } from "./sprint-mark-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

it("deduplicates queued, running and marked unchanged answers", async () => {
  const call = deferred();
  const mark = vi.fn(() => call.promise);
  const queue = createSprintMarkQueue(mark);
  queue.enqueue("a", "one");
  queue.enqueue("a", "one");
  await tick();
  expect(mark).toHaveBeenCalledTimes(1);
  call.resolve();
  await tick();
  queue.enqueue("a", "one");
  expect(await queue.finish()).toEqual([]);
  expect(mark).toHaveBeenCalledTimes(1);
});

it("marks a new version after editing a marked answer", async () => {
  const mark = vi.fn().mockResolvedValue(undefined);
  const queue = createSprintMarkQueue(mark);
  queue.enqueue("a", "one");
  await tick();
  queue.enqueue("a", "two");
  await tick();
  expect(mark).toHaveBeenCalledTimes(2);
  expect(await queue.finish()).toEqual([]);
});

it("discards an in-flight version and queues only the latest edit", async () => {
  const call = deferred();
  const mark = vi
    .fn()
    .mockImplementationOnce(() => call.promise)
    .mockResolvedValue(undefined);
  const queue = createSprintMarkQueue(mark);
  queue.enqueue("a", "one");
  await tick();
  queue.enqueue("a", "two");
  queue.enqueue("a", "three");
  await tick();
  expect(mark).toHaveBeenCalledTimes(1);
  call.resolve();
  await tick();
  expect(mark).toHaveBeenCalledTimes(2);
  expect(await queue.finish()).toEqual([]);
});

it("keeps failures silent and leaves them for the Finish retry", async () => {
  const mark = vi.fn().mockRejectedValue(new Error("Rate limited"));
  const queue = createSprintMarkQueue(mark);
  queue.enqueue("a", "one");
  await tick();
  queue.enqueue("a", "one");
  expect(await queue.finish()).toEqual(["a"]);
  expect(mark).toHaveBeenCalledTimes(1);
});

it("caps concurrency at two and starts queued work as slots free", async () => {
  const calls = [deferred(), deferred(), deferred()];
  const mark = vi.fn((id: string) => calls[Number(id)].promise);
  const queue = createSprintMarkQueue(mark);
  for (let id = 0; id < 3; id++) queue.enqueue(String(id), "one");
  await tick();
  expect(mark.mock.calls).toEqual([["0"], ["1"]]);
  calls[1].resolve();
  await tick();
  expect(mark.mock.calls).toEqual([["0"], ["1"], ["2"]]);
  calls[0].resolve();
  calls[2].resolve();
  expect(await queue.finish()).toEqual([]);
});

it("Finish waits for in-flight work and leaves only queued and failed answers", async () => {
  const first = deferred();
  const second = deferred();
  const mark = vi.fn((id: string) =>
    id === "a" ? first.promise : second.promise,
  );
  const queue = createSprintMarkQueue(mark);
  for (const id of ["a", "b", "c"]) queue.enqueue(id, "one");
  const done = vi.fn();
  const finishing = queue.finish().then((ids) => {
    done();
    return ids;
  });
  await tick();
  expect(done).not.toHaveBeenCalled();
  first.resolve();
  second.reject();
  expect(await finishing).toEqual(["b", "c"]);
  expect(mark).toHaveBeenCalledTimes(2);
});

it("resumes queued work if Finish fails", async () => {
  const mark = vi.fn().mockResolvedValue(undefined);
  const queue = createSprintMarkQueue(mark);
  for (const id of ["a", "b", "c"]) queue.enqueue(id, "one");
  expect(await queue.finish()).toEqual(["c"]);
  queue.resume();
  await tick();
  expect(mark.mock.calls).toEqual([["a"], ["b"], ["c"]]);
});

it("reports settled marks and lists only the latest marked versions", async () => {
  const calls = [deferred(), deferred(), deferred()];
  let n = 0;
  const settled = vi.fn();
  const queue = createSprintMarkQueue(() => calls[n++].promise, settled);
  queue.enqueue("a", "one");
  queue.enqueue("b", "one");
  await tick();
  calls[0].resolve();
  calls[1].reject();
  await tick();
  expect(settled).toHaveBeenCalledTimes(2);
  expect([...queue.marked()]).toEqual([["a", "one"]]);
  // An edit after marking needs a fresh mark before it counts again.
  queue.enqueue("a", "two");
  expect(queue.marked().has("a")).toBe(false);
  await tick();
  calls[2].resolve();
  await tick();
  expect(queue.marked().get("a")).toBe("two");
});
