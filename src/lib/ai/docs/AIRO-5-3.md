# Airo 5.3

23 Oct 2026. **Voice-only prompt tweak plus a deterministic post-filter. Built and unit-tested only: no paid eval or benchmark run yet, and no accuracy or feedback-quality claims.**

Source: Om, 23 Oct (7:43pm): comments should "sound like a 21 state ranker gave em... to the point... SAME QUALITY... not woozy waazy." Judgement stays the same (marks, anchors, criteria coverage); only voice and length change.

## Change

### Grading prompt (`gradeMessages`, full mode only)

Only comment-writing text in the full-grading tail changed. The shared marking prefix (role, band procedure, strictness, verb glossary, evidence rules, injection guard, checklist and restriction instructions), the user message, the check variant and the reconcile prompt are **byte-identical to Airo 5.2**, enforced by a test against `src/lib/marking/prompts-baseline-airo-5-2.json`.

| 5.2 text                                                                                                                   | 5.3 text                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body is 1–2 sentences speaking directly to the student: use "you"/"your" or a clear imperative such as "Try" or "Explain". | body is 1–2 short sentences speaking directly to the student in the direct, confident voice of a top HSC state ranker tutoring: use "you"/"your" or a plain imperative such as "Explain" or "Use".                                                                                                                                                                     |
| Name the specific strength or change; keep the tone warm, plain and direct.                                                | A fix names the exact gap and the exact fix; a strength names exactly what is right in one line, with no improvement tacked on.                                                                                                                                                                                                                                        |
| (none)                                                                                                                     | Never hedge or pad: no "consider", "could be made more explicit", "might", "perhaps", "would benefit from", "would deepen it", praise filler ("Great job", "Nice work"), restating the question, or meta lines about the feedback, the mark or what was supplied (e.g. "Already at full marks").                                                                       |
| next_mark only on fixes = the specific change that earns the next mark (null on strengths).                                | next_mark only on fixes = one imperative line naming the specific change that earns the next mark (null on strengths).                                                                                                                                                                                                                                                 |
| Comment voice examples (style only; use the student's evidence, never copy these points):                                  | Comment voice examples (voice and length only; use the student's evidence and this guideline, never copy these points or ask for data the question does not need):                                                                                                                                                                                                     |
| Five warm examples ("You explain the link clearly here…", "Try comparing both systems…")                                   | Five state-ranker examples: "You asked for data the stimulus already gives. Use it: 840 ÷ 105 × 100 = $800m."; "Correct formula, it deflates nominal GDP."; "Clear chain from higher costs to higher prices."; "You name the effect but stop. Show how it cuts household spending."; "Two separate definitions, no contrast. Put both in one sentence with "whereas"." |

Everything else in the tail is unchanged, including the 5.2 tutor rules (statistics only when required, keep needed definitions, flag waffle, verb needs, syllabus only), the tag list, the quote rule, earned/missing_points/outline, why_not_higher and next_band. The prompt grows by 496 characters (about 125 tokens) per first-pass call.

### Summary prompt (`summaryMessages`)

- Removed: "State that this summary covers written short answers and multiple-choice (MC) answers are not supplied." Now: make no claims about MC performance, and never write meta lines about what the summary covers or what was not supplied.
- "Use a plain human voice" became the state-ranker voice, with no hedging or padding.
- "Aim for 2-4 short, specific points per list" became "Give at most 3 points per list, each one line (one short sentence) citing its question, e.g. "Q3"".

### Deterministic post-filter (`src/lib/marking/comment-voice.ts`)

Applied in `markWritten` after `anchorComments` (comments) and in `summariseSession` (summary). It rewrites prose only, never `quote`, `start`, `kind`, `tag`, order or field set, and never marks.

1. Split sentences safely (decimals, `$800m.`, `e.g.`, `i.e.`, closing quotes, lower-case continuations stay intact).
2. Drop meta sentences: "This summary/feedback covers…", "MC answers were not supplied", "This/It (change) will not add a mark" (only when the comment itself is the subject, so "Do not add a statistic because it will not earn a mark" stays), a bare "Already at full marks". When a meta clause shares a sentence with advice ("… will not earn another mark; explain how …" or "…, so explain how …"), only the meta clause goes.
3. Drop praise-only sentences with no content ("Great job.", "Well done!", "Keep up the good work."); "Good work explaining…" keeps its content.
4. Strip banned openers: "Overall,", "In summary,", "It is important to note that", "Note that", "Perhaps,", "Well done,", "Great job!", "In this answer,", "This demonstrates that", "Already at full marks;", "You could/might/may (want to) <known verb>" (so "You may be confusing…" is kept), "Try to". "Consider <verb>ing" becomes the imperative for a fixed list of verbs (e.g. "Consider adding" → "Add"); unknown verbs are left alone.
5. Strip the qualifier "without changing your mark" (keeping the advice). Rewrite hedges only when the subject is part of the student's writing (your/this/the link, definition, sentence, paragraph, explanation, contrast and similar): "could be made more explicit" → "needs to be explicit"; "could be clearer" → "needs to be clearer"; "would benefit from" → "needs". A whole sentence "It could be made more explicit." becomes "It needs to be explicit." Economic actors and outcomes ("exporters would benefit from", "demand could be stronger") are never rewritten. Economic qualifiers inside a sentence ("only slightly elastic", "a little", "possibly offset") are never removed.
6. Strengths only: drop a tacked-on writing suggestion that starts with an action ("Adding …", "Naming …") and ends "would deepen/sharpen/make it …", when another sentence remains. Economic outcomes ("Higher spending would strengthen aggregate demand.") are kept.
7. Cap: comment body 2 sentences, `next_mark` 1 sentence; summary lines 1 sentence each and at most 3 per list (strengths, improvements, next steps).
8. If filtering would leave nothing, the original text is kept.

The filter is idempotent and leaves already-direct comments byte-identical. Offline over the saved 5.2 results (no calls): run 1414 (67 comments) unchanged; run 1417 (727 comments) 2 bodies and 5 `next_mark` lines changed, 0 emptied, 0 field or anchor changes. Most of the length cut must come from the prompt, so it is only measurable in a paid run.

## Effect on marks

Comments come from the same first-pass grader call as the first mark, so a voice change **can still shift first-pass marks** (and final marks when the passes agree). Risk is reduced: the marking prefix, check and reconcile prompts are byte-identical, the tail keeps every marking-relevant sentence, and the post-filter runs after marking. Expect a small number of ±1 first-pass changes from sampling and wording, as in 5.2.

## Proposed benchmark (needs Om's approval; not run)

Same marker (`anthropic/claude-sonnet-5.5`, low / low / medium) and judge (`gpt-6-astra`, low) as runs 1414 and 1417, compared with them as the 5.2 baseline. Estimated cost: held-out 196 about $11.6 (range $11-12.5), A1 comment check about $1.8, so about $13.4 in total. Metrics: exact, within-1, signed error and marks changed against 1417; judge mean, pros kept and cons fixed against 1414; median comment length and stock-phrase counts.
