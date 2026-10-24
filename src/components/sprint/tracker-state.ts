/**
 * Question tracker colours, shared by every sprint surface that shows a
 * question's state. Swap tokens here and the booklet follows.
 */
export const TRACKER_STATE = {
  unanswered: "bg-foreground/25 text-foreground",
  active: "bg-heat-2 text-foreground",
  answered: "bg-brand text-brand-foreground",
  // `--pill-flag` is the flag token; error red until it is defined in globals.css.
  flag: "bg-[var(--pill-flag,var(--destructive))]",
} as const;

/** Fill states for a question disc (the flag is a dot on top of any of them). */
export type TrackerState = Exclude<keyof typeof TRACKER_STATE, "flag">;
