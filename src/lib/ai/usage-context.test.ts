// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { withAttemptUsage, usageAttemptId } from "./usage-context";
it("keeps concurrent attempts and their nested marking passes isolated", async () => {
  expect(usageAttemptId()).toBeNull();
  const result = await Promise.all(
    ["a", "b"].map((id) =>
      withAttemptUsage(id, async () => {
        await Promise.resolve();
        return await Promise.all(
          [1, 2].map(async () => {
            await Promise.resolve();
            return usageAttemptId();
          }),
        );
      }),
    ),
  );
  expect(result).toEqual([
    ["a", "a"],
    ["b", "b"],
  ]);
  expect(usageAttemptId()).toBeNull();
});
it("clears attribution after an error", async () => {
  await expect(
    withAttemptUsage("a", async () => {
      throw new Error("failure");
    }),
  ).rejects.toThrow("failure");
  expect(usageAttemptId()).toBeNull();
});
