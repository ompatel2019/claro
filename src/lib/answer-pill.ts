/**
 * Results answer pills on the sprint tracker states.
 * TRACKER_STATE mirrors src/components/sprint/tracker-state.ts (claro-ml, it3/booklet-modal);
 * swap this local copy for that import once it is on main.
 */
const TRACKER_STATE = {
  notAnswered: "bg-muted text-muted-foreground",
  active: "bg-brand-soft text-brand-text",
  answered: "bg-brand text-brand-foreground",
  flagged: "bg-[var(--pill-flag)]",
} as const;

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

/** Full = answered (Orange), part = active (orange tint), none and pending = grey, not answered = grey dashed. */
export const ANSWER_PILL_TONE: Record<AnswerPillState, string> = {
  full: TRACKER_STATE.answered,
  part: TRACKER_STATE.active,
  none: TRACKER_STATE.notAnswered,
  not_answered: `${TRACKER_STATE.notAnswered} border-muted-foreground/45 border-dashed`,
  pending: TRACKER_STATE.notAnswered,
};

/** The selected pill is raised with a 1px orange edge, never a dark ring. */
export const ANSWER_PILL_SELECTED = "border-brand shadow-card -translate-y-0.5";

/** Legend dots carry a hairline so the tints stay visible on Paper and in dark mode. */
export const ANSWER_LEGEND: [label: string, dot: string][] = [
  ["Full marks", "bg-brand border border-brand"],
  ["Part marks", "bg-brand-soft border border-brand/50"],
  ["No marks", "bg-muted border border-foreground/25"],
  ["Not answered", "border border-dashed border-muted-foreground"],
];
