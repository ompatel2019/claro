// @vitest-environment node
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const query = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
  order: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: query.from }),
}));

import { examplePool, pickBandExamples, pickQuotaExamples } from "./examples";
import { evalSets } from "@/lib/ai/eval/sets";
import type { MarkableQuestion } from "./grade";

const criteria = [
  { min: 1, max: 1, descriptor: "Some" },
  { min: 2, max: 3, descriptor: "Sound" },
];
const ex = (tutor_mark: number, answer_text = `m${tutor_mark}`) => ({
  answer_text,
  tutor_mark,
});

it("picks up to two whole-mark anchors per band and for 0, highest band first", () => {
  expect(
    pickBandExamples(criteria, [
      ex(1, "a"),
      ex(0, "z"),
      ex(2.5),
      ex(3, "b"),
      ex(1, "c"),
      ex(1, "d"),
      ex(2, "e"),
      ex(3, "f"),
    ]).map((e) => e.answer_text),
  ).toEqual(["b", "e", "a", "c", "z"]);
  expect(pickBandExamples(criteria, [])).toEqual([]);
});

it("reads the grader view for the question, which excludes test rows", async () => {
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [ex(2), ex(1)], error: null });
  const q = { id: "a1-m2-21a", criteria } as MarkableQuestion;
  expect(await examplePool(q)).toEqual([ex(2), ex(1)]);
  expect(query.from).toHaveBeenCalledWith("marking_examples_for_grader");
  expect(query.eq).toHaveBeenCalledWith("question_id", "a1-m2-21a");
  query.order.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(examplePool(q)).rejects.toThrow("marking examples: boom");
});

it("applies eval exclusions before fetching the example pool", async () => {
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [ex(2)], error: null });
  const q = { id: "fixture-question", criteria } as MarkableQuestion;
  expect(await examplePool(q, ["locked-final", "dev-self"])).toEqual([ex(2)]);
  expect(query.not).toHaveBeenCalledWith(
    "id",
    "in",
    `(${[...evalSets.final, "locked-final", "dev-self"].join(",")})`,
  );
});

const singleBands = [1, 2, 3, 4].map((mark) => ({
  min: mark,
  max: mark,
  descriptor: `Band ${mark}`,
}));
const quotaQuestion = { marks: 4, criteria: singleBands };
const pool = [
  ex(0, "unrelated zero"),
  ex(1, "unrelated lower"),
  ex(1, "demand raises prices"),
  ex(2, "demand raises prices"),
  ex(3, "unrelated higher"),
  ex(3, "demand raises prices"),
  ex(4, "demand raises prices"),
  ex(4, "demand raises prices further"),
  ex(4, "demand raises costs"),
  ex(4, "irrelevant text"),
];

it.each([
  [2, [2, 1, 3]],
  [0, [0, 1, 2]],
  [4, [4, 2, 3]],
])("covers the quota at first mark %s, including edges", (mark, expected) => {
  const selected = pickQuotaExamples(
    quotaQuestion,
    pool,
    "demand raises prices",
    mark as number,
  );
  expect(selected).toHaveLength(6);
  expect(selected.slice(0, 3).map((e) => e.tutor_mark)).toEqual(expected);
  expect(new Set(selected).size).toBe(6);
});

it("prefers adjacent near-misses, then fills by similarity with stable ties", () => {
  const selected = pickQuotaExamples(
    quotaQuestion,
    pool,
    "DEMAND raises prices!",
    2,
  );
  expect(selected).toEqual([
    pool[3],
    pool[2],
    pool[5],
    pool[6],
    pool[7],
    pool[8],
  ]);
  expect(
    pickQuotaExamples(quotaQuestion, pool, "demand raises prices", 2),
  ).toEqual(selected);
});

it("uses adjacent whole marks even within a wider guideline band", () => {
  const q = {
    marks: 8,
    criteria: [
      { min: 1, max: 2, descriptor: "Low" },
      { min: 3, max: 5, descriptor: "Middle" },
      { min: 6, max: 8, descriptor: "High" },
    ],
  };
  const examples = [
    ex(4),
    ex(3),
    ex(5),
    ...Array.from({ length: 7 }, (_, i) => ex(5, `filler ${i}`)),
  ];
  expect(pickQuotaExamples(q, examples, "m5", 4).slice(0, 3)).toEqual(
    examples.slice(0, 3),
  );
});

it("keeps band anchors for sparse or non-whole-mark pools", () => {
  const sparse = pool.slice(0, 9);
  expect(pickQuotaExamples(quotaQuestion, sparse, "demand", 2)).toEqual(
    pickBandExamples(singleBands, sparse),
  );
  expect(
    pickQuotaExamples(quotaQuestion, [...sparse, ex(2.5)], "demand", 2),
  ).toEqual(pickBandExamples(singleBands, sparse));
});

it("fills missing quota bands and handles empty text deterministically", () => {
  const examples = Array.from({ length: 10 }, (_, i) => ex(2, `row ${i}`));
  expect(pickQuotaExamples(quotaQuestion, examples, "", 0)).toEqual(
    examples.slice(0, 6),
  );
});

it("preserves tutor comments and excludes rows before quota ranking", async () => {
  const note = {
    ...pool[3],
    accepted_tutor_comments: [{ body: "Explains the mechanism." }],
  };
  const eligible = [...pool.slice(0, 3), note, ...pool.slice(4)];
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  // The mocked view returns only rows left after its exclusion predicate.
  query.order.mockResolvedValue({ data: eligible, error: null });
  const q = { ...quotaQuestion, id: "fixture-question" } as MarkableQuestion;
  const rows = await examplePool(q, ["locked-final", "dev-self"]);
  expect(query.select).toHaveBeenCalledWith(
    "answer_text, tutor_mark, accepted_tutor_comments",
  );
  expect(query.not).toHaveBeenCalledWith(
    "id",
    "in",
    `(${[...evalSets.final, "locked-final", "dev-self"].join(",")})`,
  );
  expect(pickQuotaExamples(q, rows, "demand raises prices", 2)[0]).toEqual(
    note,
  );
  expect(rows).toEqual(eligible);
});

it("uses bigrams to favour phrase overlap over identical unigrams", () => {
  const examples = [
    ex(2, "prices raises demand"),
    ex(2, "demand raises prices"),
    ...Array.from({ length: 8 }, (_, i) => ex(i % 5, `unrelated ${i}`)),
  ];
  expect(
    pickQuotaExamples(quotaQuestion, examples, "demand raises prices", 2)[0],
  ).toBe(examples[1]);
});

it("always excludes frozen final IDs without caller exclusions and unions them uniquely", async () => {
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [], error: null });
  const q = { id: "live-question", criteria } as MarkableQuestion;
  await examplePool(q);
  expect(query.not).toHaveBeenLastCalledWith(
    "id",
    "in",
    `(${evalSets.final.join(",")})`,
  );
  await examplePool(q, [evalSets.final[0], "caller-excluded"]);
  expect(query.not).toHaveBeenLastCalledWith(
    "id",
    "in",
    `(${[...evalSets.final, "caller-excluded"].join(",")})`,
  );
});
