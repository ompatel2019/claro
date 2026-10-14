import { expect, it } from "vitest";
import { bootstrap } from "./stats";
import passes from "./sets/past-passes.json";
import flags from "./sets/flagged-tutor-marks.json";
import {
  BOOTSTRAP,
  readRescoreRuns,
  rescore,
  rescoreReport,
  ruleMark,
  type RescoreRow,
} from "./rescore.js";

const row = (overrides: Partial<RescoreRow> = {}): RescoreRow => ({
  id: "question-a",
  exampleIdSha256: "fixture-hash",
  marks: 4,
  expected: 2,
  mark: 1,
  check: { marks: [1, 2, 1] },
  ...overrides,
});

it("uses only the first two passes and preserves fractional midpoints", () => {
  const input = row({ check: { marks: [1, 2, 4] } });
  expect(ruleMark(input, "current")).toBe(1);
  expect(ruleMark(input, "higher")).toBe(2);
  expect(ruleMark(input, "lower")).toBe(1);
  expect(ruleMark(input, "first-pass-only")).toBe(1);
  expect(ruleMark(input, "midpoint")).toBe(1.5);
  expect(input.check.marks).toEqual([1, 2, 4]);
});

it("calculates exact, within-one, MAE, bias and disagreement denominators", () => {
  const scores = rescore([
    row(),
    row({ expected: 0, mark: 2, check: { marks: [2, 2] } }),
    row({ expected: 1, mark: 1, check: { marks: [1, 1] } }),
  ]);
  expect(scores[0]).toMatchObject({
    n: 3,
    exactCount: 1,
    exact: 1 / 3,
    within1: 2 / 3,
    mae: 1,
    signedBias: 1 / 3,
    disagreements: 1,
    disagreementExactCount: 0,
    disagreementExact: 0,
    gainVsCurrent: 0,
    gain95: { low: 0, high: 0 },
  });
  expect(scores[1]).toMatchObject({
    exact: 2 / 3,
    mae: 2 / 3,
    signedBias: 2 / 3,
    disagreementExact: 1,
    gainVsCurrent: 1 / 3,
  });
  expect(scores[4].mae).toBe(2.5 / 3);
});

it("bootstraps entire questions with a fixed seed and paired observations", () => {
  // One question with differing gains must always retain all its answers.
  const oneQuestion = [row(), row({ expected: 1, mark: 1 })];
  expect(rescore(oneQuestion)[1].gain95).toEqual({ low: 0, high: 0 });
  const twoQuestions = [row(), row({ id: "question-b", expected: 1, mark: 1 })];
  const result = rescore(twoQuestions);
  expect(result[1].gain95).toEqual({ low: -1, high: 1 });
  expect(rescore(twoQuestions)).toEqual(result);
  expect(rescore([...twoQuestions].reverse())).toEqual(result);
  expect(BOOTSTRAP).toEqual({ seed: 1415, samples: 2000 });
});

it("handles empty sets and agreement-only sets without NaN", () => {
  expect(rescore([])[0]).toMatchObject({
    n: 0,
    exact: null,
    within1: null,
    mae: null,
    signedBias: null,
    disagreementExact: null,
    gainVsCurrent: null,
    gain95: null,
  });
  expect(
    rescore([row({ check: { marks: [1, 1] } })])[0].disagreementExact,
  ).toBeNull();
});

it("reads compact files and filters unscored results without mutating input", () => {
  expect(readRescoreRuns([row()])[0].rows).toHaveLength(1);
  expect(readRescoreRuns({ run: [row()] })[0].name).toBe("run");
  const items = [
    { ...row(), section: "Held-out" },
    { ...row(), section: "A1" },
    { ...row(), section: "Held-out", error: "failed" },
    { ...row(), section: "Held-out", flags: { excluded: "reason" } },
    { ...row(), section: "Held-out", expected: [1, 2] },
    { ...row(), section: "Held-out", check: { marks: [1] } },
    { ...row(), section: "Held-out", mark: 5 },
    { ...row(), section: "Held-out", mark: null },
  ];
  expect(readRescoreRuns({ items })[0]).toMatchObject({
    skipped: 6,
    rows: [row()],
  });
  expect(items).toHaveLength(8);
  expect(() => readRescoreRuns({ run: "invalid" })).toThrow();
});

it("pools repeated observations and excludes hashes across every run", () => {
  const runs = readRescoreRuns({
    a: [row()],
    b: [row(), row({ exampleIdSha256: "other" })],
  });
  const report = rescoreReport(runs, ["fixture-hash"]);
  expect(report.runs.map((run) => run.withFlagged[0].n)).toEqual([1, 2, 3]);
  expect(report.runs.map((run) => run.withoutFlagged[0].n)).toEqual([0, 1, 1]);
  expect(report.runs.map((run) => run.flagged)).toEqual([1, 1, 2]);
  expect(report.runs[2].withFlagged[1].gain95).toEqual({ low: 1, high: 1 });
});

it("reproduces appendix 7.3 against the real saved passes", () => {
  const report = rescoreReport(
    readRescoreRuns(passes),
    flags.map((flag) => flag.exampleIdSha256),
  );
  const [run1415, partial, pooled] = report.runs;
  expect(run1415.withFlagged[0].n).toBe(194);
  expect(partial.withFlagged[0].n).toBe(63);
  expect(run1415.withFlagged.map((score) => score.disagreements)).toEqual([
    24, 24, 24, 24, 24,
  ]);
  expect(
    run1415.withFlagged.map((score) => score.disagreementExactCount),
  ).toEqual([7, 12, 7, 5, 0]);
  expect(run1415.withFlagged[1].gainVsCurrent).toBe(5 / 194);
  expect(partial.withFlagged[2].disagreementExactCount).toBe(4);
  expect(pooled.withFlagged[1].disagreementExactCount).toBe(12);
  expect(pooled.withFlagged[2].disagreementExactCount).toBe(11);
  expect(run1415.flagged).toBe(10);
  expect(run1415.withoutFlagged[0].n).toBe(184);
});

it("uses the comparison bootstrap for the same paired question observations", () => {
  const rows = [row(), row({ id: "question-b", expected: 1, mark: 1 })];
  const interval = bootstrap(
    rows.map((r) => ({
      baseline: { ...r, section: "Rescore" },
      candidate: { ...r, section: "Rescore", mark: ruleMark(r, "higher") },
    })),
    BOOTSTRAP.seed,
    BOOTSTRAP.samples,
  ).exact!;
  expect(rescore(rows)[1].gain95).toEqual({
    low: interval[0],
    high: interval[1],
  });
});
