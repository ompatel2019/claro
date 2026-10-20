// Free lexical indicators, not a feedback-quality judge.
export const STOCK_PHRASES = [
  "this demonstrates",
  "the response",
  "the student",
  "overall",
  "it is important to note",
  "consider",
  "well done",
];

export const IMPERATIVE_VERBS = [
  "try",
  "explain",
  "show",
  "add",
  "link",
  "name",
  "use",
  "state",
  "compare",
  "consider",
  "distinguish",
  "define",
  "describe",
  "include",
  "give",
  "be",
  "make",
  "clarify",
  "check",
  "avoid",
  "focus",
  "spell",
  "read",
];

const normalise = (text: string) =>
  text.toLowerCase().replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (text: string, phrases: readonly string[]) =>
  phrases.some((phrase) => {
    const value = normalise(phrase);
    return value && new RegExp(`(?<!\\w)${escape(value)}(?!\\w)`).test(text);
  });

function rate(comments: readonly string[], matches: (text: string) => boolean) {
  const texts = comments.map(normalise).filter(Boolean);
  return texts.length ? texts.filter(matches).length / texts.length : null;
}

export function stockPhraseRate(
  comments: readonly string[],
  phrases: readonly string[] = STOCK_PHRASES,
) {
  return rate(comments, (text) => contains(text, phrases));
}

export function secondPersonRate(comments: readonly string[]) {
  return rate(
    comments,
    (text) =>
      /\b(?:you|your)\b/.test(text) ||
      new RegExp(
        `(?:^|[.!?]\\s+)(?:please\\s+)?(?:${IMPERATIVE_VERBS.map(escape).join("|")})\\b`,
      ).test(text),
  );
}

export function thirdPersonRate(comments: readonly string[]) {
  return rate(comments, (text) =>
    contains(text, ["the student", "the response"]),
  );
}

type ToneRow = {
  flags?: { excluded?: string };
  feedbackComments?: readonly { body: string; next_mark?: string | null }[];
  feedback?: string | null;
};

function commentsFromRow(row: ToneRow): string[] {
  if (row.feedbackComments?.length)
    return row.feedbackComments.map((comment) =>
      [comment.body, comment.next_mark].filter(Boolean).join(". "),
    );
  if (!row.feedback?.trim()) return [];
  // Legacy renderFeedback format: omit justification, quotes and outline.
  const rendered = [
    ...row.feedback.matchAll(
      /^\d+\. \[(?:Strength|Fix)[^\]\n]*\] .*" — (.+)$/gm,
    ),
  ];
  return rendered.length
    ? rendered.map((match) => match[1].replace(/ Next mark: /g, ". "))
    : [row.feedback];
}

export function summariseTone(rows: readonly ToneRow[]) {
  const comments = rows
    .filter((row) => !row.flags?.excluded)
    .flatMap(commentsFromRow)
    .filter((text) => text.trim());
  return {
    n: comments.length,
    stockPhraseRate: stockPhraseRate(comments),
    secondPersonRate: secondPersonRate(comments),
    thirdPersonRate: thirdPersonRate(comments),
  };
}
