/**
 * Results answer pills, on the tracker tokens: full marks = Orange fill with deep Navy text (4.9:1; brand Navy
 * #1E223D is 4.45:1 on Orange, just under AA), part marks = orange tint with Orange Text (4.85:1 light, 5.8:1 dark), no marks = neutral muted,
 * not answered = dashed outline. The selected pill is raised with a 1px orange edge, never a dark ring.
 */
export type AnswerPillState =
  "full" | "part" | "none" | "not_answered" | "pending";

export function answerPillState({
  mark,
  max,
  answered = true,
  scored = true,
}: {
  mark: unknown;
  max: unknown;
  answered?: boolean;
  scored?: boolean;
}): AnswerPillState {
  if (!answered) return "not_answered";
  if (!scored || mark == null || !Number.isFinite(Number(mark)))
    return "pending";
  const m = Number(mark);
  const of = Number(max);
  if (Number.isFinite(of) && of > 0 && m >= of) return "full";
  return m > 0 ? "part" : "none";
}

export const ANSWER_PILL_TONE: Record<AnswerPillState, string> = {
  full: "bg-brand text-navy-deep",
  part: "bg-brand-soft text-brand-text",
  none: "bg-muted text-foreground",
  not_answered:
    "bg-card border-muted-foreground/45 border-dashed text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
};

export const ANSWER_PILL_SELECTED = "border-brand shadow-card -translate-y-0.5";

/** Legend dots carry a hairline so the tints stay visible on Paper and in dark mode. */
export const ANSWER_LEGEND: [label: string, dot: string][] = [
  ["Full marks", "bg-brand border border-brand"],
  ["Part marks", "bg-brand-soft border border-brand/50"],
  ["No marks", "bg-muted border border-foreground/25"],
  ["Not answered", "border border-dashed border-muted-foreground"],
];
