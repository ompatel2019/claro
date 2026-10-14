import { expect, it } from "vitest";
import { buildPerformance } from "./performance";
import type { OfflineEvalRun } from "./summary";
const run = (stamp: string, flag = true): OfflineEvalRun => ({
  meta: {
    stamp,
    airo: "4.2",
    benchmark: ["heldout-196"],
    sameQuestionExamples: flag,
    label: "test",
    marker: { model: "mock" },
  },
  heldOut: {
    exact: 0.5,
    within1: 1,
    meanSigned: -0.2,
    usdPerAnswer: 0.01,
    secondsPerAnswer: 2,
  },
  items: [],
});
it("uses only recorded changelog numbers and leaves unevaluated versions missing", () => {
  const rows = buildPerformance([], "a1-18");
  expect(rows.find((r) => r.airo === "1.0")?.values[0]).toMatchObject({
    exact: 0.333,
    source: expect.stringContaining("0901"),
  });
  expect(rows.find((r) => r.airo === "4.1")?.values[0].exact).toBeUndefined();
  expect(
    buildPerformance([], "heldout-196").find((r) => r.airo === "2.0")?.values[0]
      .exact,
  ).toBeUndefined();
});
it("includes the recorded held-out baseline for the shipped 0940 engine", () => {
  expect(
    buildPerformance([], "heldout-196").find((r) => r.airo === "2.1")
      ?.values[0],
  ).toMatchObject({ exact: 0.449, source: expect.stringContaining("1159") });
});
it("selects latest per benchmark and flag, ignoring legacy, partial and unfinished runs", () => {
  const older = run("2026-10-14-1000");
  older.heldOut = { exact: 0.1 };
  const latest = run("2026-10-14-1100");
  const partial = run("2026-10-14-1200");
  partial.meta.limit = 1;
  const blocked = run("2026-10-14-1300");
  blocked.meta.blocked = true;
  const legacy = run("2026-10-14-1400");
  delete legacy.meta.airo;
  const running = run("2026-10-14-1500");
  running.meta.status = "running";
  const rows = buildPerformance(
    [
      latest,
      older,
      run("2026-10-14-0900", false),
      partial,
      blocked,
      legacy,
      running,
    ],
    "heldout-196",
  );
  expect(rows.find((r) => r.airo === "4.2")?.values).toEqual([
    expect.objectContaining({
      exact: 0.5,
      sameQuestionExamples: true,
      source: "Recorded run 2026-10-14-1100",
    }),
    expect.objectContaining({ sameQuestionExamples: false }),
  ]);
  expect(
    buildPerformance([latest], "a1-18").find((r) => r.airo === "4.2")?.values[0]
      .exact,
  ).toBeUndefined();
});
it("overrides historical figures for matching settings and retains a distinct historical setting", () => {
  const recorded = run("2026-10-14-1000");
  recorded.meta.airo = "3.0";
  expect(
    buildPerformance([recorded], "heldout-196").find((r) => r.airo === "3.0")
      ?.values,
  ).toHaveLength(1);
  recorded.meta.sameQuestionExamples = false;
  expect(
    buildPerformance([recorded], "heldout-196").find((r) => r.airo === "3.0")
      ?.values,
  ).toHaveLength(2);
});
it("computes item-only runs with held-out failures as misses and marking cost only", () => {
  const recorded = run("2026-10-14-1000");
  delete recorded.heldOut;
  recorded.items = [
    {
      section: "Held-out",
      marks: 2,
      expected: 1,
      mark: 1,
      usd: 0.02,
      judgeUsd: 99,
      seconds: 4,
    },
    {
      section: "Held-out",
      marks: 2,
      expected: 1,
      mark: null,
      error: "failed",
      usd: 0.01,
      seconds: 2,
    },
  ];
  expect(
    buildPerformance([recorded], "heldout-196").find((r) => r.airo === "4.2")
      ?.values[0],
  ).toMatchObject({
    exact: 0.5,
    within1: 0.5,
    meanSigned: 0,
    usdPerAnswer: 0.015,
    secondsPerAnswer: 3,
  });
});
