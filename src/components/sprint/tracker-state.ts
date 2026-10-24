/**
 * Question tracker colours, shared by every sprint surface that shows a
 * question's state. Swap tokens here and the booklet follows.
 */
export const TRACKER_STATE = {
  unanswered: "bg-foreground/25 text-foreground",
  active: "bg-heat-2 text-foreground",
  answered: "bg-brand text-brand-foreground",
  // `--pill-flag` is the flag token (ink-2 in globals.css; flags are never red).
  flag: "bg-[var(--pill-flag,var(--ink-2))]",
} as const;

/** Fill states for a question disc (the flag is a dot on top of any of them). */
export type TrackerState = Exclude<keyof typeof TRACKER_STATE, "flag">;
