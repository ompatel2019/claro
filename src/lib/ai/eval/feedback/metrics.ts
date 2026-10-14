export type Label = "accepted" | "rejected";
export type Prediction = { questionId: string; label: Label; predicted: Label };

function score(rows: Prediction[]) {
  const n = rows.length;
  const tp = rows.filter(
    (r) => r.label === "rejected" && r.predicted === "rejected",
  ).length;
  const tn = rows.filter(
    (r) => r.label === "accepted" && r.predicted === "accepted",
  ).length;
  const fp = rows.filter(
    (r) => r.label === "accepted" && r.predicted === "rejected",
  ).length;
  const fn = n - tp - tn - fp;
  const ratio = (a: number, b: number) => (b ? a / b : null);
  const accuracy = ratio(tp + tn, n);
  const recallRejected = ratio(tp, tp + fn);
  const recallAccepted = ratio(tn, tn + fp);
  const expected = n
    ? ((tp + fn) * (tp + fp) + (tn + fp) * (tn + fn)) / n ** 2
    : null;
  return {
    n,
    confusion: { tp, tn, fp, fn },
    accuracy,
    balancedAccuracy:
      recallRejected === null || recallAccepted === null
        ? null
        : (recallRejected + recallAccepted) / 2,
    precisionRejected: ratio(tp, tp + fp),
    recallRejected,
    kappa:
      accuracy === null || expected === null || expected === 1
        ? null
        : (accuracy - expected) / (1 - expected),
  };
}

/** Undefined metrics are null (empty set, missing class, or degenerate kappa). */
export function feedbackMetrics(rows: Prediction[]) {
  return {
    overall: score(rows),
    byQuestion: Object.fromEntries(
      [...new Set(rows.map((r) => r.questionId))]
        .sort()
        .map((id) => [id, score(rows.filter((r) => r.questionId === id))]),
    ),
  };
}
