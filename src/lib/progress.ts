import { addDays } from "./activity";
import type { Topic } from "./practice";

export const PRACTICE_TARGET = 80;

export const PROGRESS_RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number]["value"];
export function parseRange(
  value: string | string[] | undefined,
): ProgressRange {
  return PROGRESS_RANGES.some((r) => r.value === value)
    ? (value as ProgressRange)
    : "90";
}
export function rangeFrom(range: ProgressRange, today: string) {
  return range === "all"
    ? null
    : range === "year"
      ? `${today.slice(0, 4)}-01-01`
      : addDays(today, 1 - Number(range));
}
export type TopicProgress = Topic & {
  answered: number;
  sessions?: number;
  earned: number;
  possible: number;
  pct: number | null;
  last_answered: string | null;
};
export type Breakdown = {
  id: string;
  answered: number;
  pct: number | null;
  earned?: number;
  possible?: number;
};
export type HistoryScore = {
  id: string;
  kind: string;
  config: { mode?: string; topics?: string[]; subtopics?: string[] };
  finished_at: string;
  elapsed_s: number;
  pct: number | null;
  by_type: Record<string, number>;
};
export type Mastery = {
  id: string;
  known: number;
  learning: number;
  missed: number;
  new: number;
};
export type ProgressData = {
  topics: TopicProgress[];
  types: Breakdown[];
  verbs: Breakdown[];
  history: HistoryScore[];
  mastery: Mastery[];
  missed: { id: string; name: string; missed: number }[];
  due: { day: string; count: number }[];
};
export function reportHref(s: Pick<HistoryScore, "id" | "kind">) {
  return s.kind === "single" || s.kind === "sprint"
    ? `/student/activity/${s.id}`
    : s.kind === "flashcards"
      ? `/student/flashcards/${s.id}`
      : null;
}
export function practiseHref(
  t: Pick<Topic, "id" | "parent_id">,
  mistakes = false,
) {
  const p = new URLSearchParams(
    t.parent_id ? { topics: t.parent_id, sub: t.id } : { topics: t.id },
  );
  if (mistakes) p.set("history", "mistakes");
  return `/student/sprint?${p}`;
}
/** Scored topics first, weakest first; unstarted topics retain syllabus order. */
export function weakestTopics(rows: TopicProgress[]) {
  return [...rows].sort(
    (a, b) =>
      (a.pct ?? Infinity) - (b.pct ?? Infinity) ||
      a.sort - b.sort ||
      a.id.localeCompare(b.id),
  );
}
