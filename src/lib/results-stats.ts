import { markingState, type ReviewRow } from "@/lib/feedback";
import { timer } from "@/lib/practice";
import { scored } from "@/lib/results";

const maxOf = (r: ReviewRow) => Number(r.max_marks ?? r.marks);
export const fullMarks = (r: ReviewRow) =>
  scored(r) && Number(r.mark ?? 0) >= maxOf(r);
/** Marked below full marks, or never answered. Still-marking rows are not counted yet. */
export const lostMarks = (r: ReviewRow) =>
  (scored(r) && !fullMarks(r)) || markingState(r) === "skipped";

/** The page opens on the first question that lost marks, else the first question. */
export const firstLost = (rows: ReviewRow[]) =>
  Math.max(0, rows.findIndex(lostMarks));

/** "Q2", "Q2 and Q3", "Q2, Q3 and Q7". */
export function questionList(positions: number[]) {
  const qs = positions.map((p) => `Q${p}`);
  return qs.length < 2
    ? (qs[0] ?? "")
    : `${qs.slice(0, -1).join(", ")} and ${qs.at(-1)}`;
}

export function scoreVsAverage(pct: number | null, avg: number | null) {
  if (pct == null || avg == null) return null;
  const d = Math.round(pct - avg);
  if (d === 0) return { text: "Same as your average", up: false };
  const n = Math.abs(d);
  return {
    text: `${n} ${n === 1 ? "point" : "points"} ${d > 0 ? "above" : "below"} your average`,
    up: d > 0,
  };
}

export function timeVsAverage(seconds: number, avg: number | null) {
  if (avg == null) return null;
  const d = Math.round(seconds - avg);
  if (Math.abs(d) < 5) return "About your average time";
  return `${timer(Math.abs(d))} ${d < 0 ? "quicker" : "slower"} than your average`;
}
