// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  bootstrap,
  compareRows,
  isFlagged,
  isScored,
  mcnemarExact,
  metrics,
  pairRows,
  quadraticWeightedKappa,
  type EvalRow,
} from "./stats";

const row = (overrides: Partial<EvalRow> = {}): EvalRow => ({
  id: "question-a",
  section: "Held-out",
  marks: 2,
  expected: 1,
  mark: 1,
  score: { band: true },
  ...overrides,
});

it("calculates exact two-sided McNemar including balanced and large counts", () => {
  expect(mcnemarExact(1, 9)).toBeCloseTo(0.021484375, 12);
  expect(mcnemarExact(9, 1)).toBe(mcnemarExact(1, 9));
  expect(mcnemarExact(0, 0)).toBe(1);
  expect(mcnemarExact(5, 5)).toBe(1);
  expect(mcnemarExact(0, 3)).toBeCloseTo(0.25);
  expect(mcnemarExact(1000, 1000)).toBeCloseTo(1);
  expect(() => mcnemarExact(-1, 2)).toThrow();
});

it("computes known QWK 0.8 and n-weighted groups with confusion counts", () => {
  // Observed squared disagreement 1/3, chance disagreement 5/3.
  const rows = [
    row({ expected: 0, mark: 0 }),
    row({ expected: 1, mark: 2 }),
    row({ expected: 2, mark: 2 }),
  ].filter(isScored);
  expect(quadraticWeightedKappa(rows)).toBeCloseTo(0.8);
  expect(quadraticWeightedKappa([row()].filter(isScored))).toBeNull();
  const result = metrics(
    [
      ...rows,
      row({ marks: 3, expected: 0, mark: 1 }),
      row({ marks: 3, expected: 1, mark: 0 }),
    ].filter(isScored),
  );
  expect(result.qwk).toBeCloseTo((3 * 0.8 - 2) / 5);
  expect(result.byMax[0].confusion).toEqual([
    { expected: 0, mark: 0, n: 1 },
    { expected: 1, mark: 2, n: 1 },
    { expected: 2, mark: 2, n: 1 },
  ]);
  expect(
    quadraticWeightedKappa(
      [row({ expected: 0, mark: 0.5 }), row({ expected: 1, mark: 1 })].filter(
        isScored,
      ),
    ),
  ).toBeCloseTo(2 / 3);
});

it("pairs reordered identities, legacy occurrences and reserves identities", () => {
  const a = row({ exampleId: "synthetic-a" }),
    b = row({ exampleId: "synthetic-b" });
  expect(pairRows([a, b], [b, a]).pairs).toEqual([
    { baseline: a, candidate: a },
    { baseline: b, candidate: b },
  ]);
  expect(pairRows([row(), a], [a, row()])).toMatchObject({
    pairs: [{ baseline: a, candidate: a }],
    unpairedBaseline: 1,
    unpairedCandidate: 1,
  });
  expect(pairRows([a], [b]).pairs).toEqual([]);
  expect(pairRows([row(), row()], [row()])).toMatchObject({
    unpairedBaseline: 1,
    unpairedCandidate: 0,
  });
  expect(pairRows([row()], [row({ section: "Dev" })]).pairs).toEqual([]);
  expect(pairRows([a], [row()]).pairs).toHaveLength(1);
});

it("does not shift occurrences when an error precedes a scored row", () => {
  const result = compareRows(
    [row({ error: "mock error" }), row({ mark: 0 })],
    [row(), row()],
    [],
  );
  expect(result.all).toMatchObject({
    invalidBaseline: 1,
    invalidPairs: 1,
    pairedBaseline: { n: 1, exact: 0 },
    pairedCandidate: { n: 1, exact: 1 },
    mcnemar: { b: 0, c: 1, p: 1 },
  });
});

it("excludes flagged hashes plus their legacy counterpart and never exposes IDs", () => {
  const flagged = row({ exampleId: "synthetic-flagged" });
  const flags = [
    {
      question: flagged.id,
      exampleIdSha256: createHash("sha256")
        .update(flagged.exampleId!)
        .digest("hex"),
    },
  ];
  expect(isFlagged(flagged, flags)).toBe(true);
  expect(isFlagged({ ...flagged, id: "other" }, flags)).toBe(false);
  const report = compareRows([flagged, row()], [row(), row()], flags);
  expect(report.excludingFlagged).toMatchObject({
    excludedBaseline: 1,
    excludedCandidate: 1,
    pairedBaseline: { n: 1 },
  });
  expect(JSON.stringify(report)).not.toContain("synthetic-flagged");
});

it("reports hand-computed paired metrics, normalized bias and band logic", () => {
  const criteria = [{ min: 1, max: 2, descriptor: "Band" }];
  const baseline = [
    row({ expected: 0, mark: 1, score: undefined, criteria }),
    row({ marks: 4, expected: 2, mark: 2 }),
  ];
  const candidate = [
    row({ expected: 0, mark: 0 }),
    row({ marks: 4, expected: 2, mark: 1, score: { band: false } }),
  ];
  const report = compareRows(baseline, candidate, []);
  expect(report.all.baseline).toMatchObject({
    exact: 0.5,
    within1: 1,
    band: 0.5,
    signedBias: 0.5,
    biasShare: 0.25,
    mae: 0.5,
  });
  expect(report.all.difference).toMatchObject({
    exact: 0,
    signedBias: -1,
    biasShare: -0.375,
    mae: 0,
  });
  expect(metrics([row({ score: undefined })].filter(isScored))).toMatchObject({
    band: null,
    bandN: 0,
  });
});

it("bootstraps whole questions deterministically with point estimates inside fixture CIs", () => {
  const baseline = [row(), row(), row({ id: "question-b", mark: 0 })];
  const candidate = [
    row({ mark: 0 }),
    row({ mark: 0 }),
    row({ id: "question-b" }),
  ];
  const report = compareRows(baseline, candidate, [], { seed: 42 });
  const ci = report.all.bootstrap;
  expect(
    compareRows(baseline, candidate, [], { seed: 42 }).all.bootstrap,
  ).toEqual(ci);
  expect(ci.questions).toBe(2);
  // Seed 42 draws questions (b, a), then (b, b): means -1/3 and 1.
  const small = compareRows(baseline, candidate, [], {
    seed: 42,
    resamples: 2,
  });
  expect(small.all.bootstrap.exact![0]).toBeCloseTo(-0.3);
  expect(small.all.bootstrap.exact![1]).toBeCloseTo(29 / 30);
  expect(ci.exact).toEqual([-1, 1]);
  expect(ci.signedBias).toEqual([-1, 1]);
  expect(ci.exact![0]).toBeLessThanOrEqual(report.all.difference.exact!);
  expect(ci.exact![1]).toBeGreaterThanOrEqual(report.all.difference.exact!);
  expect(ci.signedBias![0]).toBeLessThanOrEqual(
    report.all.difference.signedBias!,
  );
  expect(ci.signedBias![1]).toBeGreaterThanOrEqual(
    report.all.difference.signedBias!,
  );
  expect(bootstrap([], 1, 10)).toEqual({
    questions: 0,
    exact: null,
    signedBias: null,
  });
  expect(() => bootstrap([], 1, 0)).toThrow();
  expect(
    compareRows([row()], [row({ mark: 0 })], [], { resamples: 5 }).all
      .bootstrap,
  ).toMatchObject({ exact: [-1, -1], signedBias: [-1, -1] });
});

it("counts invalid and incompatible rows, unpaired rows and section filters", () => {
  const report = compareRows(
    [row({ expected: 2 }), row({ id: "extra" }), row({ section: "Dev" })],
    [row(), row({ id: "failed", mark: null })],
    [],
  );
  expect(report.all).toMatchObject({
    incompatiblePairs: 1,
    unpairedBaseline: 1,
    unpairedCandidate: 1,
    invalidCandidate: 1,
    pairedBaseline: { n: 0 },
    mcnemar: { p: null },
  });
  expect(
    compareRows([row({ section: "Dev" })], [], [], { section: "Dev" }).all
      .baseline.n,
  ).toBe(1);
  for (const overrides of [
    { mark: null },
    { mark: NaN },
    { mark: 3 },
    { expected: [1, 2] },
    { marks: 0 },
    { flags: { excluded: "fixture" } },
  ])
    expect(isScored(row(overrides))).toBe(false);
});

it("uses a common denominator for paired band agreement", () => {
  const report = compareRows(
    [row(), row({ score: undefined })],
    [row({ score: { band: false } }), row()],
    [],
  );
  expect(report.all).toMatchObject({
    pairedBaseline: { band: 1, bandN: 1 },
    pairedCandidate: { band: 0, bandN: 1 },
    difference: { band: -1 },
  });
});
