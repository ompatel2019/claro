import { expect, it } from "vitest";
import { feedbackMetrics, type Prediction } from "./metrics";

it("computes binary metrics with rejected as positive and groups by question", () => {
  const rows: Prediction[] = [
    ...Array.from({ length: 3 }, () => ({
      questionId: "q1",
      label: "rejected" as const,
      predicted: "rejected" as const,
    })),
    { questionId: "q1", label: "rejected", predicted: "accepted" },
    { questionId: "q1", label: "accepted", predicted: "rejected" },
    { questionId: "q2", label: "accepted", predicted: "accepted" },
  ];
  const report = feedbackMetrics(rows);
  expect(report.overall.confusion).toEqual({ tp: 3, tn: 1, fp: 1, fn: 1 });
  expect(report.overall.accuracy).toBeCloseTo(2 / 3);
  expect(report.overall.balancedAccuracy).toBe(0.625);
  expect(report.overall.precisionRejected).toBe(0.75);
  expect(report.overall.recallRejected).toBe(0.75);
  expect(report.overall.kappa).toBeCloseTo(0.25);
  expect(report.byQuestion.q1.n).toBe(5);
  expect(report.byQuestion.q2).toMatchObject({
    accuracy: 1,
    balancedAccuracy: null,
    kappa: null,
  });
});

it("reports null rather than fabricated scores for undefined metrics", () => {
  expect(feedbackMetrics([]).overall).toMatchObject({
    n: 0,
    accuracy: null,
    balancedAccuracy: null,
    precisionRejected: null,
    recallRejected: null,
    kappa: null,
  });
});

it("returns kappa 1 for perfect agreement and -1 for reversed balanced labels", () => {
  const rows: Prediction[] = [
    { questionId: "q", label: "accepted", predicted: "accepted" },
    { questionId: "q", label: "rejected", predicted: "rejected" },
  ];
  expect(feedbackMetrics(rows).overall.kappa).toBe(1);
  expect(
    feedbackMetrics(
      rows.map((r) => ({
        ...r,
        predicted: r.predicted === "accepted" ? "rejected" : "accepted",
      })),
    ).overall.kappa,
  ).toBe(-1);
});
