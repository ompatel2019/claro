/**
 * Results answer tiles. Tracker states come from one local copy of TRACKER_STATE
 * (src/components/sprint/tracker-state.ts on claro-ml's it3/booklet-modal); swap this copy for that
 * import once it is on main. Only the result-specific states are added here.
 */
const TRACKER_STATE = {
  notAnswered: "bg-muted text-muted-foreground",
  active: "bg-brand-soft text-brand-text",
  answered: "bg-brand text-brand-foreground",
  flagged: "bg-[var(--pill-flag)]",
} as const;

export type AnswerPillState = "full" | "dropped" | "not_answered" | "pending";

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
  const of = Number(max);
  return Number.isFinite(of) && of > 0 && Number(mark) >= of
    ? "full"
    : "dropped";
}

/**
 * Open = tracker active (light orange). Full marks = Orange with deep Navy text (4.9:1; white on
 * Orange is 3.5:1, too low for the tile's small text). Dropped = error tint with error text
 * (5.9:1 light). Not answered and still marking = tracker grey.
 */
export const RESULT_TILE = {
  open: TRACKER_STATE.active,
  full: "bg-brand text-navy-deep",
  dropped: "bg-destructive-soft text-destructive-text",
  not_answered: TRACKER_STATE.notAnswered,
  pending: TRACKER_STATE.notAnswered,
} as const;

export const RESULT_ICON = {
  full: "check",
  dropped: "flag",
  not_answered: "minus",
  pending: "clock",
} as const;

export const RESULT_WORD: Record<AnswerPillState, string> = {
  full: "Full marks",
  dropped: "Marks dropped",
  not_answered: "Not answered",
  pending: "Being marked",
};

/** Legend swatches carry a hairline so the tints stay visible on Paper and in dark mode. */
export const RESULT_SWATCH = {
  open: "bg-brand-soft border border-brand/40",
  full: "bg-brand border border-brand",
  dropped: "bg-destructive-soft border border-destructive/50",
  not_answered: "bg-muted border border-foreground/25",
  pending: "bg-muted border border-foreground/25",
} as const;

export const RESULT_LEGEND: [string, string][] = [
  ["Open now", RESULT_SWATCH.open],
  ["Full marks", RESULT_SWATCH.full],
  ["Marks dropped", RESULT_SWATCH.dropped],
  ["Not answered", RESULT_SWATCH.not_answered],
];
