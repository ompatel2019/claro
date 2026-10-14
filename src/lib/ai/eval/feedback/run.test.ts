// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

// The production loader and model must never be imported or executed by these tests.
vi.mock("@/utils/supabase/admin", () => {
  throw new Error("Unexpected admin import");
});
vi.mock("../../openai", () => {
  throw new Error("Unexpected model import");
});
const main = async () =>
  ((await import("./run.mts" as string)) as typeof import("./run.mjs")).main;
const rows = [
  {
    id: "mock-row",
    question_id: "mock-question",
    answer_text: "A mock answer",
    split: "example",
    question: {
      stem: "Explain trade.",
      marks: 2,
      stimulus: null,
      criteria: [],
    },
    accepted_tutor_comments: [
      { author: "tutor", kind: "note", quote: "", body: "Clear mechanism" },
    ],
    rejected_ai_comments: [
      { kind: null, quote: "", body: "Unsupported criticism" },
    ],
  },
];
const deps = () => ({
  load: vi.fn().mockResolvedValue(rows),
  model: vi
    .fn()
    .mockResolvedValue({ evidence: "Supported", verdict: "accepted" }),
  spend: vi.fn().mockResolvedValue(0),
});
afterEach(() => vi.restoreAllMocks());

it.each([[[]], [["--dry-run"]]])(
  "defaults to a dry-run with an injectable mocked loader %j",
  async (args) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mocks = deps();
    const report = await (await main())(args, mocks);
    expect(report).toMatchObject({
      mode: "dry-run",
      items: 2,
      accepted: 1,
      rejected: 1,
      questions: 1,
    });
    expect(report.estimate.totalUsd).toBeGreaterThan(0);
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).not.toContain("mock-row");
  },
);

it("runs live only through injected mocks and enforces the eval spend guard", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const mocks = deps();
  const report = await (
    await main()
  )(["--live", "--limit=2", "--seed=7"], mocks);
  expect(report.metrics?.overall.n).toBe(2);
  expect(mocks.model).toHaveBeenCalledTimes(2);
  mocks.spend.mockResolvedValue(80);
  mocks.model.mockClear();
  await expect((await main())(["--live"], mocks)).rejects.toThrow("blocked");
  expect(mocks.model).not.toHaveBeenCalled();
});

it.each(
  [
    ["--live", "--dry-run"],
    ["--limit=3"],
    ["--limit=0"],
    ["--seed=4294967296"],
    ["--wat"],
    ["--seed=-1"],
    ["--live", "--live"],
  ].map((args) => [args]),
)("rejects flags %j before loading anything", async (args) => {
  const mocks = deps();
  await expect((await main())(args, mocks)).rejects.toThrow();
  expect(mocks.load).not.toHaveBeenCalled();
});
