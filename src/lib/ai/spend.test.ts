// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  OPENROUTER_MODEL_PREFIX,
  isOpenRouterModel,
  openRouterSpend,
} from "./spend";

function mockDb(rows: { model: string; usd: unknown }[] = []) {
  let filtered = rows;
  const range = vi.fn<
    (
      from: number,
      to: number,
    ) => Promise<{
      data: { usd: unknown }[] | null;
      error: { message: string } | null;
    }>
  >(async (from, to) => ({
    data: filtered.slice(from, to + 1).map(({ usd }) => ({ usd })),
    error: null,
  }));
  const order = vi.fn(() => ({ range }));
  const like = vi.fn((_column: string, pattern: string) => {
    filtered = rows.filter((row) => row.model.startsWith(pattern.slice(0, -1)));
    return { order };
  });
  const select = vi.fn(() => ({ like }));
  const from = vi.fn(() => ({ select }));
  return { db: { from }, from, select, like, order, range };
}

it("identifies OpenRouter models by the Anthropic prefix", () => {
  expect(OPENROUTER_MODEL_PREFIX).toBe("anthropic/");
  expect(isOpenRouterModel("anthropic/claude-sonnet-5.5")).toBe(true);
  expect(isOpenRouterModel("gpt-6.1-sol")).toBe(false);
});

it("excludes $61.00 of OpenAI spend and counts $19.20 of OpenRouter spend", async () => {
  const rows = [
    { model: "gpt-6.1-sol", usd: "40.00" },
    { model: "gpt-6.1-sol", usd: "21.00" },
    { model: "anthropic/claude-sonnet-5.5", usd: "10.00" },
    { model: "anthropic/claude-sonnet-5.5", usd: 9.2 },
  ];
  const mocks = mockDb(rows);
  expect(
    rows
      .filter((row) => !isOpenRouterModel(row.model))
      .reduce((total, row) => total + Number(row.usd), 0),
  ).toBe(61);
  const expected = rows
    .filter((row) => isOpenRouterModel(row.model))
    .reduce((total, row) => total + Number(row.usd), 0);
  expect(expected).toBeCloseTo(19.2);
  await expect(openRouterSpend(mocks.db)).resolves.toBe(expected);
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("ai_usage");
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith("usd");
  expect(mocks.like).toHaveBeenCalledExactlyOnceWith("model", "anthropic/%");
  expect(mocks.order).toHaveBeenCalledExactlyOnceWith("id");
  expect(mocks.range).toHaveBeenCalledExactlyOnceWith(0, 999);
});

it("paginates beyond the 1000-row cap", async () => {
  const mocks = mockDb(
    Array.from({ length: 1001 }, () => ({
      model: "anthropic/claude-sonnet-5.5",
      usd: "1.25",
    })),
  );
  await expect(openRouterSpend(mocks.db)).resolves.toBe(1251.25);
  expect(mocks.range).toHaveBeenCalledTimes(2);
  expect(mocks.range).toHaveBeenNthCalledWith(1, 0, 999);
  expect(mocks.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  expect(mocks.like).toHaveBeenNthCalledWith(2, "model", "anthropic/%");
  expect(mocks.order).toHaveBeenNthCalledWith(2, "id");
});

it("returns zero when there are no OpenRouter rows", async () => {
  await expect(openRouterSpend(mockDb().db)).resolves.toBe(0);
});

it("throws on a spend query error", async () => {
  const mocks = mockDb();
  mocks.range.mockResolvedValueOnce({
    data: null,
    error: { message: "Mock storage failure" },
  });
  await expect(openRouterSpend(mocks.db)).rejects.toThrow(
    "ai_spend failed: Mock storage failure",
  );
});

it.each(["invalid", NaN, Infinity, -Infinity])(
  "rejects non-finite spend %s",
  async (usd) => {
    const mocks = mockDb([{ model: "anthropic/claude-sonnet-5.5", usd }]);
    await expect(openRouterSpend(mocks.db)).rejects.toThrow(
      "Invalid ai_spend result",
    );
  },
);

it("rejects a missing spend result", async () => {
  const mocks = mockDb();
  mocks.range.mockResolvedValueOnce({ data: null, error: null });
  await expect(openRouterSpend(mocks.db)).rejects.toThrow(
    "Invalid ai_spend result",
  );
});
