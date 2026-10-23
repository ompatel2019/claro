/** Display-time clean-up of the stored sprint summary: drops meta lines and caps each list at three. */

export type SummaryLists = {
  strengths?: string[];
  improvements?: string[];
  top_fixes?: string[];
  next_steps?: string[];
};

export const SUMMARY_CAP = 3;

// Conservative: only lines that talk about the summary or its inputs, not the student's work.
const META = [
  /\bthis summary\b.{0,40}\b(?:covers?|includes?|is based on|only|looks at)\b/i,
  /\b(?:multiple[- ]choice|mc)\b[^.]{0,40}\b(?:were|are|was|is|have been|has been)\s+not\s+(?:supplied|provided|included|available)\b/i,
  /\b(?:only|just) (?:covers?|includes?|looks at) (?:your )?written\b/i,
  /\bmakes? no claims? about (?:your )?(?:mc|multiple[- ]choice)\b/i,
  // Model self-reference only at the start of a sentence, not "use ChatGPT as an AI tool".
  /(?:^|[.!?]\s+)as an ai\b/i,
  /\b(?:as a language model|i am an ai|i'm an ai|i am a language model|i'm a language model)\b/i,
];

export function isMetaLine(text: string) {
  return META.some((re) => re.test(text));
}

const clean = (lines: unknown) =>
  (Array.isArray(lines) ? lines : [])
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.trim())
    .filter((l) => l && !isMetaLine(l))
    .slice(0, SUMMARY_CAP);

/** Question numbers cited in a line, in order and without repeats ("Q4 and Q5" -> [4, 5]). */
export function questionRefs(text: string) {
  return [
    ...new Set([...text.matchAll(/\bQ(\d+)\b/g)].map((m) => Number(m[1]))),
  ];
}

export function summaryView(summary: SummaryLists | null | undefined) {
  return {
    strengths: clean(summary?.strengths),
    fixes: clean(summary?.top_fixes ?? summary?.improvements),
  };
}
