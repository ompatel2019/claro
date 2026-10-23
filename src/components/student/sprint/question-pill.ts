import { cn } from "@/lib/utils";
import { TRACKER_STATE } from "@/components/sprint/tracker-state";

export function questionPillState({
  active = false,
  answered = false,
  flagged = false,
}: {
  active?: boolean;
  answered?: boolean;
  flagged?: boolean;
}) {
  return {
    className: cn(
      "relative rounded-full",
      answered
        ? TRACKER_STATE.answered
        : active
          ? TRACKER_STATE.active
          : TRACKER_STATE.notAnswered,
      active && "z-10 scale-110",
      flagged &&
        "after:absolute after:-top-0.5 after:-right-0.5 after:size-2 after:rounded-full after:bg-[var(--pill-flag)] after:outline-2 after:outline-background",
    ),
    label: `${answered ? "answered" : "not answered"}${flagged ? ", flagged" : ""}${active ? ", current" : ""}`,
    "aria-current": active ? ("step" as const) : undefined,
  };
}
