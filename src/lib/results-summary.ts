/** Display-time clean-up of the stored sprint summary: drops meta lines, caps lists, picks one next step. */

export type SummaryLists = {
  strengths?: string[];
  improvements?: string[];
  top_fixes?: string[];
  next_steps?: string[];
};

export const SUMMARY_CAP = 3;

// Conservative: only lines that talk about the summary or its inputs, not the student's work.
const META = [
  /\bth(?:is|e) summary\b.{0,40}\b(?:covers?|includes?|is based on|only|looks at)\b/i,
  /\b(?:multiple[- ]choice|mc)\b[^.]{0,40}\b(?:were|are|was|is|have been|has been)\s+not\s+(?:supplied|provided|included|available)\b/i,
  /\b(?:only|just) (?:covers?|includes?|looks at) (?:your )?written\b/i,
  /\bmakes? no claims?\b/i,
  /\bas an ai\b/i,
  /\b(?:language model|i am an ai|i'm an ai)\b/i,
];

export function isMetaLine(text: string) {
  return META.some((re) => re.test(text));
}

const clean = (lines: unknown) =>
  (Array.isArray(lines) ? lines : [])
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.trim())
    .filter((l) => l && !isMetaLine(l));

/** First question number cited in a line ("Q3" -> 3). */
export function questionRef(text: string) {
  const m = /\bQ(\d+)\b/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * The one next step: the first usable next_steps line, else the first fix.
 * Fixes never repeat it, and each list is capped at three.
 */
export function summaryView(
  summary: SummaryLists | null | undefined,
  { withoutStep = true } = {},
) {
  const steps = clean(summary?.next_steps);
  const fixesAll = clean(summary?.top_fixes ?? summary?.improvements);
  const step = steps[0] ?? fixesAll[0] ?? null;
  const same = (a: string, b: string) =>
    a.replace(/\s+/g, " ").toLowerCase() ===
    b.replace(/\s+/g, " ").toLowerCase();
  return {
    strengths: clean(summary?.strengths).slice(0, SUMMARY_CAP),
    fixes: fixesAll
      .filter((f) => !withoutStep || !step || !same(f, step))
      .slice(0, SUMMARY_CAP),
    nextStep: step ? { text: step, question: questionRef(step) } : null,
  };
}
