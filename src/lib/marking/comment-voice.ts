/**
 * Airo 5.3 deterministic voice post-filter. Rewrites only prose (comment
 * `body` / `next_mark`, summary lines). Never touches quote, start, kind or
 * tag, never changes marks, and falls back to the original text whenever the
 * filter would leave nothing.
 */

export const BODY_MAX_SENTENCES = 2;
export const NEXT_MARK_MAX_SENTENCES = 1;
export const SUMMARY_MAX_ITEMS = 3;

const ABBREVIATIONS =
  /(?:\b(?:e\.g|i\.e|etc|vs|cf|approx|incl|no|p|pp|Dr|Mr|Mrs|Ms|St)|\b[A-Z])\.$/i;

/** Split prose into sentences without breaking decimals, "e.g." or "$800m." mid-number. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    // Swallow trailing closing quotes/brackets.
    while (i + 1 < text.length && /["'”’)\]]/u.test(text[i + 1])) {
      current += text[++i];
    }
    const next = text[i + 1];
    if (next !== undefined && !/\s/u.test(next)) continue; // 1.5, e.g.x
    if (
      ch === "." &&
      ABBREVIATIONS.test(current.trimEnd().replace(/["'”’)\]]+$/u, ""))
    )
      continue;
    const rest = text.slice(i + 1).trimStart();
    // A lower-case continuation is not a new sentence (e.g. "approx. 3%").
    if (rest && /^[a-z]/u.test(rest)) continue;
    out.push(current.trim());
    current = "";
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function capitalise(s: string) {
  return s.replace(
    /^(["'“‘(]*)([a-z])/u,
    (_, p: string, c: string) => p + c.toUpperCase(),
  );
}

/** Whole sentences that only describe the feedback itself, never the student's work. */
const META_SENTENCE = [
  /\bthis (summary|feedback|report|comment|review)\b.*\b(covers?|is based|only|focus(es)?|looks at|includes?)\b/i,
  /\b(multiple[- ]choice|MCQs?|MC)\b(?=[^.]*\b(answers?|questions?|responses?|items?)\b)[^.]*\b(not|weren't|were not|aren't|are not)\b[^.]*\b(supplied|provided|included|available|assessed|shown|given)\b/i,
  /\bwithout (changing|affecting) (the|your) mark\b/i,
  /^already at full marks[.!]?$/i,
  /\b(not|never|won't|will not|without|doesn't|does not) (add|adding|change|changing|affect|affecting|earn|earning|cost|costing|lift|lifting) (a|the|your|any|another|an extra) (extra )?marks?\b/i,
  /\bas an ai\b/i,
];

/** Sentences that are pure praise padding with no content. */
const PADDING_SENTENCE =
  /^(?:(?:great|good|nice|excellent|fantastic|awesome|solid) (?:job|work|effort|start|attempt)|well done|keep (?:it )?up the (?:good|great) work)(?: here| overall)?[.!]*$/i;

/** Strength comments padded with a hedged improvement ("Adding X would deepen it."). */
const STRENGTH_HEDGE_SENTENCE =
  /^(?:adding|naming|explaining|including|linking|stating|showing|using|giving|defining|mentioning|citing|quoting|specifying|clarifying|tying|connecting|developing|expanding)\b.*\bwould (?:also )?(?:deepen|sharpen|strengthen|improve|enhance|lift|polish|make) (?:it|this|that|the answer|your answer|the point|your point|the link|your link|the explanation|your explanation|the definition|your definition|the response)\b/i;

/** Opener prefixes removed from the start of a sentence (the rest is kept). */
const OPENERS: RegExp[] = [
  /^overall,?\s+/i,
  /^(in summary|to summarise|to summarize|in conclusion),?\s+/i,
  /^it is (important|worth) (to note|noting) that\s+/i,
  /^it is (important|worth) (to note|noting),?\s+/i,
  /^(please )?note that\s+/i,
  /^(note|notably),\s+/i,
  /^(perhaps|maybe),?\s+/i,
  /^(great|good|nice|excellent) (job|work)[,!;:]\s+/i,
  /^well done[,!;:]\s+/i,
  /^in this (answer|response),?\s+/i,
  /^this (demonstrates|shows) that\s+/i,
  /^already at full marks[;:,.]\s*/i,
  /^(you )?(might|may) (want to|wish to)\s+/i,
  /^try to\s+/i,
];

/** "Consider <gerund>" becomes the imperative for verbs we know. */
const GERUNDS: Record<string, string> = {
  adding: "Add",
  explaining: "Explain",
  linking: "Link",
  using: "Use",
  naming: "Name",
  including: "Include",
  stating: "State",
  making: "Make",
  giving: "Give",
  showing: "Show",
  defining: "Define",
  comparing: "Compare",
  quoting: "Quote",
  writing: "Write",
  tying: "Tie",
  contrasting: "Contrast",
  identifying: "Identify",
  outlining: "Outline",
  describing: "Describe",
  referring: "Refer",
  citing: "Cite",
  connecting: "Connect",
  clarifying: "Clarify",
  specifying: "Specify",
  developing: "Develop",
  ending: "End",
  starting: "Start",
  opening: "Open",
  replacing: "Replace",
  cutting: "Cut",
  removing: "Remove",
  rewriting: "Rewrite",
  expanding: "Expand",
  judging: "Judge",
};

/**
 * Hedged phrases rewritten to the direct form, only when the subject is part of
 * the student's writing (never an economic actor or outcome such as "demand").
 */
const WRITING =
  "(?:your|this|that|the) (?:link|links|definition|answer|sentence|paragraph|point|explanation|contrast|comparison|argument|mechanism|response|opening|judgement|analysis|wording|example|chain|conclusion|topic sentence|introduction|structure)";
const HEDGES: [RegExp, string][] = [
  [
    new RegExp(`\\b(${WRITING}) could be made (?:more )?explicit\\b`, "gi"),
    "$1 needs to be explicit",
  ],
  // "It could be made more explicit." as a whole sentence is always about the writing.
  [
    /^(It) could be made (?:more )?explicit(?=[.!]?$)/i,
    "$1 needs to be explicit",
  ],
  [
    new RegExp(
      `\\b(${WRITING}) could be (?:made )?(clearer|more precise|sharper)\\b`,
      "gi",
    ),
    "$1 needs to be $2",
  ],
  [new RegExp(`\\b(${WRITING}) would benefit from\\b`, "gi"), "$1 needs"],
];

/** "You could/might/may (also) (want to) <verb>" becomes the imperative, for known verbs only. */
const MODAL_SUGGESTION = new RegExp(
  `^you (?:could|might|may) (?:also )?(?:want to )?(?=(?:${Object.values(
    GERUNDS,
  )
    .map((verb) => verb.toLowerCase())
    .join("|")})\\b)`,
  "i",
);

function stripOpeners(sentence: string): string {
  let s = sentence.trim();
  for (let guard = 0; guard < 4; guard++) {
    const before = s;
    s = s.replace(MODAL_SUGGESTION, "");
    const consider =
      /^(you (could|might|may|should) )?consider ([a-z]+ing)\b\s*/i.exec(s);
    if (consider && GERUNDS[consider[3].toLowerCase()]) {
      s =
        GERUNDS[consider[3].toLowerCase()] + " " + s.slice(consider[0].length);
    }
    for (const re of OPENERS) s = s.replace(re, "");
    s = capitalise(s.trim());
    if (s === before) break;
  }
  for (const [re, to] of HEDGES) s = s.replace(re, to);
  return capitalise(s.replace(/\s{2,}/g, " ").trim());
}

/**
 * Drop a meta sentence, or only its meta clauses when it also carries advice
 * ("Repeating it will not earn another mark; explain the mechanism.").
 */
function dropMetaClauses(sentence: string): string[] {
  if (!isMetaSentence(sentence)) return [sentence];
  const clauses = sentence.split(/;\s*/u);
  if (clauses.length < 2) return [];
  const kept = clauses.filter((clause) => !isMetaSentence(clause.trim()));
  if (!kept.length) return [];
  const joined = capitalise(kept.join("; ").trim());
  return [/[.!?]["'”’)\]]*$/u.test(joined) ? joined : `${joined}.`];
}

export function isMetaSentence(sentence: string) {
  return META_SENTENCE.some((re) => re.test(sentence));
}

export type TightenOptions = {
  maxSentences: number;
  /** Strengths drop hedged "would deepen it" padding when another sentence remains. */
  strength?: boolean;
};

/** Tighten one prose string; returns the original when nothing usable would remain. */
export function tightenText(text: string, opts: TightenOptions): string {
  const original = text;
  if (!text || !text.trim()) return original;
  let sentences = splitSentences(text.trim())
    .flatMap(dropMetaClauses)
    .filter((s) => !PADDING_SENTENCE.test(s.trim()))
    .map(stripOpeners)
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
  if (opts.strength && sentences.length > 1) {
    const kept = sentences.filter(
      (s, i) => i === 0 || !STRENGTH_HEDGE_SENTENCE.test(s),
    );
    if (kept.length) sentences = kept;
  }
  sentences = sentences.slice(0, Math.max(1, opts.maxSentences));
  const out = sentences.join(" ").trim();
  return out ? out : original;
}

type CommentLike = {
  kind: string;
  body: string;
  next_mark: string | null;
};

/** Apply the voice filter to comment prose only; every other field is returned untouched. */
export function tightenComments<T extends CommentLike>(comments: T[]): T[] {
  return comments.map((comment) => {
    const body = tightenText(comment.body, {
      maxSentences: BODY_MAX_SENTENCES,
      strength: comment.kind === "strength",
    });
    const next_mark =
      typeof comment.next_mark === "string"
        ? tightenText(comment.next_mark, {
            maxSentences: NEXT_MARK_MAX_SENTENCES,
          })
        : comment.next_mark;
    return { ...comment, body, next_mark };
  });
}

type SummaryLike = {
  strengths: string[];
  improvements: string[];
  next_steps: string[];
};

function tightenList(lines: string[]): string[] {
  return lines
    .map((line) => (typeof line === "string" ? line : ""))
    .filter(
      (line) => line.trim() && !splitSentences(line).every(isMetaSentence),
    )
    .map((line) => tightenText(line, { maxSentences: 1 }))
    .filter((line) => !isMetaSentence(line))
    .slice(0, SUMMARY_MAX_ITEMS);
}

/** Summary: meta lines dropped, one sentence per line, at most three per list. */
export function tightenSummary<T extends SummaryLike>(summary: T): T {
  return {
    ...summary,
    strengths: tightenList(summary.strengths),
    improvements: tightenList(summary.improvements),
    next_steps: tightenList(summary.next_steps),
  };
}
