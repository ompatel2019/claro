import { TRACKER_STATE } from "@/components/sprint/tracker-state";

/**
 * Results question pills. Shared tracker colours come from TRACKER_STATE; only the result-specific
 * mark states live in this one local map.
 */
export type AnswerPillState =
  "full" | "part" | "zero" | "not_answered" | "pending" | "unmarked";

export function answerPillState({
  mark,
  max,
  answered = true,
  scored = true,
  marking = true,
}: {
  mark: unknown;
  max: unknown;
  answered?: boolean;
  scored?: boolean;
  /** Still being marked. False for terminal unscored results (failed, unreadable, needs review). */
  marking?: boolean;
}): AnswerPillState {
  if (!answered) return "not_answered";
  if (!scored || mark == null || !Number.isFinite(Number(mark)))
    return marking ? "pending" : "unmarked";
  const got = Number(mark);
  const of = Number(max);
  if (Number.isFinite(of) && of > 0 && got >= of) return "full";
  return got > 0 ? "part" : "zero";
}

/**
 * Soft tints with darker text, from the kit's status tokens: full marks = success, part marks =
 * warning, zero = error, not answered and still marking = tracker grey. The open question keeps
 * its own colour and gets an outline (RESULT_OPEN).
 */
export const RESULT_TILE = {
  full: "bg-success-soft text-success-text",
  part: "bg-warning-soft text-warning-text",
  zero: "bg-destructive-soft text-destructive-text",
  not_answered: TRACKER_STATE.unanswered,
  pending: TRACKER_STATE.unanswered,
  unmarked: TRACKER_STATE.unanswered,
} as const satisfies Record<AnswerPillState, string>;

/** The open question: an outline in its own text colour, no fill change. */
export const RESULT_OPEN = "border-current";

export const RESULT_ICON = {
  full: "check",
  part: "circle-half",
  zero: "x",
  not_answered: "minus",
  pending: "clock",
  unmarked: "circle-alert",
} as const satisfies Record<AnswerPillState, string>;

export const RESULT_WORD: Record<AnswerPillState, string> = {
  full: "Full marks",
  part: "Part marks",
  zero: "No marks",
  not_answered: "Not answered",
  pending: "Being marked",
  unmarked: "No mark",
};

/** Legend swatches and table dots: the same tints as the pills. */
export const RESULT_SWATCH = {
  full: RESULT_TILE.full,
  part: RESULT_TILE.part,
  zero: RESULT_TILE.zero,
  not_answered: TRACKER_STATE.unanswered,
  pending: TRACKER_STATE.unanswered,
  unmarked: TRACKER_STATE.unanswered,
} as const satisfies Record<AnswerPillState, string>;

/** The pill key, in the order a student reads it. "Open" is the outline, not a colour. */
export const RESULT_LEGEND: [label: string, state: AnswerPillState | "open"][] =
  [
    ["Full marks", "full"],
    ["Part marks", "part"],
    ["No marks", "zero"],
    ["Not answered", "not_answered"],
    ["Open now", "open"],
  ];
