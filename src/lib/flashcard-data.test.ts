// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { pages } from "./flashcard-data";

it.each([undefined, 1000])(
  "preserves page bounds and a terminal empty read with size %s",
  async (size) => {
    const length = size ?? 500;
    const rows = Array.from({ length }, (_, i) => i);
    const query = vi.fn(async (from: number) => ({
      data: from === 0 ? rows : [],
      error: null,
    }));
    expect(await pages(query, size)).toEqual(rows);
    expect(query.mock.calls).toEqual([
      [0, length - 1],
      [length, length * 2 - 1],
    ]);
  },
);

it("treats null data as a short page and preserves error identity", async () => {
  const query = vi.fn(async () => ({ data: null, error: null }));
  expect(await pages(query, 1000)).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
  const error = new Error("Read unavailable");
  await expect(pages(async () => ({ data: null, error }), 1000)).rejects.toBe(
    error,
  );
});
