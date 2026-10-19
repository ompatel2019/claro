// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  OPENROUTER_MODEL_PREFIX,
  isOpenRouterModel,
  openRouterSpend,
} from "./spend";

function mockDb(rows: { model: string; usd: unknown }[] = []) {
  // Stands in for public.ai_spend_for_prefixes: sum(usd) over rows whose model starts with a prefix.
  const rpc = vi.fn<
    (
      fn: "ai_spend_for_prefixes",
      args: { p_prefixes: string[] },
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  >(async (_fn, { p_prefixes }) => ({
    data: rows
      .filter((row) => p_prefixes.some((p) => row.model.startsWith(p)))
      .reduce((total: number, row) => total + Number(row.usd), 0),
    error: null,
  }));
  return { db: { rpc }, rpc };
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
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("ai_spend_for_prefixes", {
    p_prefixes: ["anthropic/", "openai/"],
  });
});

it("sums more than 1000 rows in one SQL call", async () => {
  const mocks = mockDb(
    Array.from({ length: 1001 }, () => ({
      model: "anthropic/claude-sonnet-5.5",
      usd: "1.25",
    })),
  );
  await expect(openRouterSpend(mocks.db)).resolves.toBe(1251.25);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it("returns zero when there are no OpenRouter rows", async () => {
  await expect(openRouterSpend(mockDb().db)).resolves.toBe(0);
});

it("throws on a spend query error", async () => {
  const mocks = mockDb();
  mocks.rpc.mockResolvedValueOnce({
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
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(openRouterSpend(mocks.db)).rejects.toThrow(
    "Invalid ai_spend result",
  );
});

it("counts OpenRouter OpenAI models without including direct OpenAI calls", async () => {
  expect(isOpenRouterModel("openai/gpt-6-luna")).toBe(true);
  await expect(
    openRouterSpend(
      mockDb([
        { model: "openai/gpt-6-luna", usd: 0.1 },
        { model: "gpt-6-luna", usd: 100 },
      ]).db,
    ),
  ).resolves.toBe(0.1);
});
