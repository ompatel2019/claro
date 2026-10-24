import type { Attempt } from "./practice";

/** One line on the marking sheet: the multiple-choice block or one written answer. */
export type SheetRow = {
  key: string;
  label: string;
  detail: string;
  marked: number;
  total: number;
};
export type MarkingSheet = { rows: SheetRow[]; marked: number; total: number };

type SheetAttempt = Pick<Attempt, "id" | "status" | "max_marks"> & {
  question: Pick<Attempt["question"], "type" | "marks">;
};

const isMarked = (a: SheetAttempt) => a.status === "marked";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Builds the marking screen's answer sheet from the attempts the runner already
 * holds. Counts are real: an answer is marked only once its row says so.
 */
export function markingSheet(attempts: SheetAttempt[]): MarkingSheet {
  const rows: SheetRow[] = [];
  const numbered = attempts.map((a, i) => ({ a, n: i + 1 }));
  const mcq = numbered.filter(({ a }) => a.question.type === "mcq");
  if (mcq.length) {
    const first = mcq[0].n;
    const last = mcq[mcq.length - 1].n;
    rows.push({
      key: "mcq",
      label:
        mcq.length === 1
          ? `Multiple choice · Q${first}`
          : `Multiple choice · Q${first} to Q${last}`,
      detail: plural(mcq.length, "question"),
      marked: mcq.filter(({ a }) => isMarked(a)).length,
      total: mcq.length,
    });
  }
  for (const { a, n } of numbered) {
    if (a.question.type === "mcq") continue;
    rows.push({
      key: a.id,
      label: `Q${n}`,
      detail: `Written answer · ${plural(a.max_marks ?? a.question.marks, "mark")}`,
      marked: isMarked(a) ? 1 : 0,
      total: 1,
    });
  }
  return {
    rows,
    marked: attempts.filter(isMarked).length,
    total: attempts.length,
  };
}

/** Overlays answers the background queue has already marked this session. */
export function markedNow<T extends { id: string; status: string }>(
  attempts: T[],
  marked: Set<string>,
): T[] {
  return attempts.map((a) =>
    marked.has(a.id) && a.status !== "marked" ? { ...a, status: "marked" } : a,
  );
}
