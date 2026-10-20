// @vitest-environment node
import { expect, it, vi } from "vitest";
import { costUsd } from "@/lib/ai/prices";
import { evalSets } from "@/lib/ai/eval/sets";
import {
  assertTrials,
  buildItems,
  estimateCost,
  evaluate,
  FEEDBACK_MODEL,
  judgeMessages,
  prepareTrials,
  type FeedbackRow,
} from "./harness";

const comment = {
  author: "tutor",
  kind: "note",
  quote: "trade",
  body: "Explain the mechanism.",
};
const row = (id: string, answer = `Answer ${id}`): FeedbackRow => ({
  id,
  question_id: "mock-question",
  answer_text: answer,
  split: "example",
  question: {
    stem: "Explain trade.",
    marks: 2,
    stimulus: null,
    criteria: [{ min: 1, max: 2, descriptor: "Explains trade" }],
  },
  accepted_tutor_comments: [comment],
  rejected_ai_comments: [
    { ...comment, kind: null, body: "Invented requirement." },
  ],
});
const rows = [row("one"), row("two"), row("three"), row("four")];

it("reads both JSON shapes and excludes test/final rows and their duplicate answers", () => {
  const input = [
    ...rows,
    { ...row("test", "HELD answer"), split: "test" },
    row(evalSets.final[0], "Final answer"),
    row("copy-test", " held  ANSWER "),
    row("copy-final", "final answer"),
  ];
  const items = buildItems(input);
  expect(items).toHaveLength(8);
  expect(new Set(items.map((i) => i.rowId))).toEqual(
    new Set(rows.map((r) => r.id)),
  );
  expect(items[0]).toMatchObject({
    text: comment.body,
    quote: "trade",
    label: "accepted",
    questionId: "mock-question",
    rowId: "one",
  });
  expect(items[1]).toMatchObject({ label: "rejected", kind: null });
  expect(items[0]).not.toHaveProperty("author");
});

it("samples reproducibly regardless of loader order, with both classes balanced", () => {
  const first = prepareTrials(rows, { limit: 4 });
  expect(first).toEqual(prepareTrials([...rows].reverse(), { limit: 4 }));
  expect(first.filter((t) => t.item.label === "accepted")).toHaveLength(2);
  for (const { item, context } of first) {
    expect(context).toHaveLength(4);
    expect(context.filter((c) => c.label === "accepted")).toHaveLength(2);
    expect(context.every((c) => c.rowId !== item.rowId)).toBe(true);
  }
  expect(prepareTrials(rows, { seed: 1, limit: 8 })).not.toEqual(
    prepareTrials(rows, { seed: 2, limit: 8 }),
  );
});

it("leaves out all comments from normalized same-answer rows, even across questions", () => {
  const input = [
    row("one", "Same ANSWER"),
    row("duplicate", " same  answer "),
    ...rows.slice(2),
    { ...row("other"), question_id: "other-question" },
  ];
  for (const trial of prepareTrials(input)) {
    if (["one", "duplicate"].includes(trial.item.rowId))
      expect(
        trial.context.every((c) => !["one", "duplicate"].includes(c.rowId)),
      ).toBe(true);
    expect(
      trial.context.every((c) => c.questionId === trial.item.questionId),
    ).toBe(true);
  }
});

it("handles sparse classes and empty context without losing target balance", () => {
  const input = [
    { ...row("one"), accepted_tutor_comments: [comment, comment, comment] },
  ];
  const trials = prepareTrials(input);
  expect(trials).toHaveLength(2);
  expect(trials.every((t) => t.context.length === 0)).toBe(true);
  expect(() =>
    prepareTrials([{ ...row("one"), rejected_ai_comments: [] }]),
  ).toThrow("No balanced");
});

it.each([
  { limit: 3 },
  { limit: -2 },
  { contextLimit: 1 },
  { seed: -1 },
  { seed: NaN },
])("rejects invalid sampling options %j", (options) => {
  expect(() => prepareTrials(rows, options)).toThrow();
});

it("fails closed on malformed or duplicate source rows", () => {
  expect(() => buildItems([rows[0], rows[0]])).toThrow("Duplicate");
  expect(() => buildItems([{ ...rows[0], split: "pool" }])).toThrow();
  expect(() =>
    buildItems([{ ...rows[0], accepted_tutor_comments: [{ body: "" }] }]),
  ).toThrow();
});

it.each([
  "final",
  "test",
  "self",
  "same-answer",
  "wrong-question",
  "unbalanced",
  "forged",
  "duplicate",
])(
  "refuses a %s context leak before any model or spend call",
  async (fault) => {
    const input = [
      ...rows,
      row("duplicate-answer", rows[0].answer_text),
      row(evalSets.final[0]),
      { ...row("test"), split: "test" },
    ];
    const trials = prepareTrials(input);
    const trial = trials.find((t) => t.item.rowId === "one")!;
    const candidate = { ...trial.context[0] };
    if (fault === "final") candidate.rowId = evalSets.final[0];
    if (fault === "test") candidate.rowId = "test";
    if (fault === "self") Object.assign(candidate, trial.item);
    if (fault === "same-answer")
      Object.assign(
        candidate,
        buildItems(input).find((i) => i.rowId === "duplicate-answer"),
      );
    if (fault === "wrong-question") candidate.questionId = "other";
    if (fault === "forged") candidate.text = "Forged comment";
    if (fault === "unbalanced") trial.context.pop();
    else if (fault === "duplicate")
      trial.context = [...trial.context, ...trial.context];
    else trial.context[0] = candidate;
    const model = vi.fn();
    const spend = vi.fn();
    await expect(evaluate(input, trials, model, spend)).rejects.toThrow();
    expect(model).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  },
);

it("rejects unsafe, duplicated or unbalanced target items", () => {
  const trials = prepareTrials(rows);
  const unsafe = structuredClone(trials);
  unsafe[0].item.rowId = evalSets.final[0];
  expect(() => assertTrials(rows, unsafe)).toThrow("Unsafe");
  expect(() => assertTrials(rows, [...trials, ...trials])).toThrow("duplicate");
  expect(() => assertTrials(rows, trials.slice(0, 1))).toThrow("Unbalanced");
});

it("asks for evidence before a binary verdict and hides target label, author and row ids", () => {
  const trial = prepareTrials(rows, { contextLimit: 0 })[0];
  const messages = judgeMessages(trial);
  expect(messages[0].content).toContain("evidence first");
  const target = JSON.parse(messages[1].content as string).target;
  expect(target).not.toHaveProperty("label");
  expect(target).not.toHaveProperty("author");
  expect(target).not.toHaveProperty("rowId");
  expect(JSON.parse(messages[1].content as string).question.stem).toBe(
    "Explain trade.",
  );
});

it("costs each prompt at the configured model's standard prices", () => {
  const trials = prepareTrials(rows);
  const estimate = estimateCost(trials);
  expect(estimate.perCallUsd[0]).toBe(
    costUsd(FEEDBACK_MODEL, {
      prompt_tokens: Math.ceil(
        JSON.stringify(judgeMessages(trials[0])).length / 4,
      ),
      completion_tokens: 256,
    }),
  );
  expect(estimate.totalUsd).toBe(
    estimate.perCallUsd.reduce((a, b) => a + b, 0),
  );
});

it("evaluates with a mocked model and checks spend before each call", async () => {
  const model = vi.fn().mockResolvedValue({
    evidence: "The advice is supported.",
    verdict: "accepted",
  });
  const spend = vi.fn().mockResolvedValue(0);
  const report = await evaluate(rows, prepareTrials(rows), model, spend);
  expect(model).toHaveBeenCalledTimes(8);
  expect(spend).toHaveBeenCalledTimes(8);
  expect(report.overall).toMatchObject({
    accuracy: 0.5,
    balancedAccuracy: 0.5,
    recallRejected: 0,
    precisionRejected: null,
    kappa: 0,
  });
});

it.each([80, NaN, Infinity, -1])(
  "blocks unverifiable/capped spend %s without a model call",
  async (value) => {
    const model = vi.fn();
    await expect(
      evaluate(rows, prepareTrials(rows), model, async () => value),
    ).rejects.toThrow("blocked");
    expect(model).not.toHaveBeenCalled();
  },
);

it("stops when spend reaches the cap mid-batch or a model verdict is invalid", async () => {
  const model = vi
    .fn()
    .mockResolvedValue({ evidence: "Supported", verdict: "accepted" });
  const spend = vi.fn().mockResolvedValueOnce(79).mockResolvedValue(80);
  await expect(
    evaluate(rows, prepareTrials(rows), model, spend),
  ).rejects.toThrow("blocked");
  expect(model).toHaveBeenCalledTimes(1);
  model.mockResolvedValue({ evidence: "", verdict: "maybe" });
  await expect(
    evaluate(rows, prepareTrials(rows), model, async () => 0),
  ).rejects.toThrow();
});
