"use client";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
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
      className="bg-muted w-full max-w-full flex-wrap rounded-full p-0.5 [&>*]:flex-1"
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
      <li className="flex items-center gap-2">
        <span className="bg-ink size-3 rounded-full" /> Answered
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-card size-3 rounded-full border" /> Not answered
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-brand size-3 rounded-full" /> Flagged
      </li>
      <li className="flex items-center gap-2">
        <span className="ring-brand size-3 rounded-full ring-2" /> Current
      </li>
    </ul>
  );
}
