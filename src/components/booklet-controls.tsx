"use client";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { questionPillState } from "./student/sprint/question-pill";
import { cn } from "@/lib/utils";
type Filter = "all" | "unanswered" | "flagged";
export function BookletFilter({
  filter,
  onFilter,
}: {
  filter: Filter;
  onFilter: (v: Filter) => void;
}) {
  return (
    <ToggleGroup
      className="w-full max-w-full flex-wrap [&>*]:flex-1"
      aria-label="Show questions"
      size="sm"
      variant="default"
      value={[filter]}
      onValueChange={(v) => v[0] && onFilter(v[0] as Filter)}
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="unanswered">Unanswered</ToggleGroupItem>
      <ToggleGroupItem value="flagged">Flagged</ToggleGroupItem>
    </ToggleGroup>
  );
}
export function BookletLegend() {
  return (
    <ul className="text-muted-foreground space-y-2 text-xs">
      {[
        { label: "Not answered", state: {} },
        { label: "Current", state: { active: true } },
        { label: "Answered", state: { answered: true } },
        { label: "Flagged", state: { flagged: true } },
      ].map(({ label, state }) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-3", questionPillState(state).className)}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}
