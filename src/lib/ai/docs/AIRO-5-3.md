# Airo 5.3

23 Oct 2026. **Voice-only prompt tweak plus a deterministic post-filter. Evaluated on 23 Oct (runs 2120 and 2122): mark agreement and judge scores fell versus 5.2; see Results.**

## Airo 5.3b: filter-only variant (proposed; branch `airo/5.3b-filter-only`)

After the 5.3 benchmark failed the gate (held-out exact 52.6% to 50.0%, A1 judge 6.28 to 5.50), 5.3b reverts **every grading-prompt change**: the voice lines and the five voice examples (including the "840 ÷ 105 × 100 = $800m" example) are back to the Airo 5.2 text. The grading, blind-check and reconcile prompts are byte-identical to main; `prompts-baseline.json` is main's file again, and a sha256 over 61 rendered questions (A1 and A1 mock; full, check and reconcile prompts, with and without tutor examples and mark restrictions) matches main exactly.

Kept:

- The summary prompt changes (no meta lines, at most 3 one-line points per list with Q refs, state-ranker voice, and claro-dev's "The first next_steps item is the single most valuable action; do not repeat a Top fix word for word.").
- The deterministic post-filter in `src/lib/marking/comment-voice.ts`, which runs after marking and changes prose only. 5.3b also stops it splitting inside single-quoted passages ('…. ….'), while in-word apostrophes are still ignored.

What to expect, not measured (no paid run): **marks should be the same as 5.2**, since the marking prompts are identical and the filter runs after the mark; only run-to-run sampling noise remains. **The voice change is small**: offline over the saved 5.2 results, the filter touched 7 of 727 comments (2 bodies, 5 `next_mark` lines) and 0 of 67 in the A1 check. Session summaries change through the summary prompt and the filter. The 5.3 sections below describe the full voice version that was benchmarked and not shipped.

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
2. Drop meta sentences: "This summary/feedback covers…", "MC answers were not supplied", "This/It (change) will not add a mark" (only when the comment itself is the subject and gives no reason or condition ("because", "since", "as", "unless", "until", "if"), so "Do not add a statistic because…" and "This will not earn a mark because nominal GDP…" stay), a bare "Already at full marks". When a meta clause shares a sentence with advice ("…; explain how …", "…: replace …", "… — name …" or "…, so explain how …"), only the meta clause goes.
3. Drop praise-only sentences with no content ("Great job.", "Well done!", "Keep up the good work."); "Good work explaining…" keeps its content.
4. Strip banned openers: "Overall,", "In summary,", "It is important to note that", "Note that", "Perhaps,", "Well done,", "Great job!", "In this answer,", "This demonstrates that", "Already at full marks;", "You could/might/may (want to) <known verb>" (so "You may be confusing…" is kept), "Try to". "Consider <verb>ing" becomes the imperative for a fixed list of verbs (e.g. "Consider adding" → "Add"); unknown verbs are left alone.
5. Strip the qualifier "without changing your mark" (keeping the advice). Rewrite hedges only when the subject is part of the student's writing (your/this/the link, definition, sentence, paragraph, explanation, contrast and similar): "could be made more explicit" → "needs to be explicit"; "could be clearer" → "needs to be clearer"; "would benefit from" → "needs". A whole sentence "It could be made more explicit." becomes "It needs to be explicit." Economic actors and outcomes ("exporters would benefit from", "demand could be stronger") are never rewritten. Economic qualifiers inside a sentence ("only slightly elastic", "a little", "possibly offset") are never removed.
6. Strengths only: drop a tacked-on writing suggestion that starts with an action ("Adding …", "Naming …") and ends "would deepen/sharpen/make it …", when another sentence remains. Economic outcomes ("Higher spending would strengthen aggregate demand.") are kept.
7. Cap: comment body 2 sentences, `next_mark` 1 sentence; summary lines 1 sentence each and at most 3 per list (strengths, improvements, next steps).
8. If filtering would leave nothing, the original text is kept.

The filter is idempotent and leaves already-direct comments byte-identical. Offline over the saved 5.2 results (no calls): run 1414 (67 comments) unchanged; run 1417 (727 comments) 2 bodies and 5 `next_mark` lines changed, 0 emptied, 0 field or anchor changes. Most of the length cut must come from the prompt, so it is only measurable in a paid run.

## Effect on marks

Comments come from the same first-pass grader call as the first mark, so a voice change **can still shift first-pass marks** (and final marks when the passes agree). Risk is reduced: the marking prefix, check and reconcile prompts are byte-identical, the tail keeps every marking-relevant sentence, and the post-filter runs after marking. Expect a small number of ±1 first-pass changes from sampling and wording, as in 5.2.

## Results (23 Oct, runs 2120 and 2122)

Marker `anthropic/claude-sonnet-5.5` (low / low / medium), judge `gpt-6-astra` (low), commit f509599, clean tree. Baseline is Airo 5.2 (runs 1417 and 1414, commit cf6867f), so these deltas isolate 5.3. Result files stay local (they quote student answers).

**Mark agreement is worse than 5.2: held-out exact fell 2.6 points (52.6% to 50.0%), and the A1 judge mean fell from 6.28 to 5.50. Not recommended to ship as is.**

### Held-out (run 2120, 196 answers, 41 questions)

| Metric                    | 5.2 (1417) | 5.3 (2120) |
| ------------------------- | ---------- | ---------- |
| Exact                     | 52.6%      | 50.0%      |
| Within-1                  | 95.4%      | 94.9%      |
| Mean signed (+ = lenient) | -0.01      | +0.01      |
| First-pass exact          | 50.0%      | 47.4%      |
| Blind-check agreement     | 80.6%      | 81.6%      |
| Reconciled / in review    | 38 / 0     | 35 / 1     |
| Errors                    | 0          | 0          |
| Median comment body       | 113 chars  | 106 chars  |
| Median next_mark          | 81 chars   | 77 chars   |
| Comments per answer       | 3.71       | 3.82       |

Paired on the same 196 answers: 18 marks changed (11 up by 1, 7 down by 1), 6 moved closer to the tutor mark and 12 further. Total marks 406 to 410. 21 first-pass calls needed a schema retry for `better_answer_outline` counts (logged warnings, retried successfully).

### A1 comment check (run 2122, items 0-19, judge on; headline n = 18)

| Metric            | 5.2 (1414) | 5.3 (2122) |
| ----------------- | ---------- | ---------- |
| Judge mean (1-10) | 6.28       | 5.50       |
| Pros kept         | 73.3%      | 50.0%      |
| Cons fixed        | 45.5%      | 36.4%      |
| Exact             | 66.7%      | 66.7%      |
| Within-1          | 94.4%      | 94.4%      |
| Median comment    | 98 chars   | 95 chars   |

Largest judge drops: fm-2 (9 to 5), fm-5 (10 to 6), ei-5 (5 to 2, mark 2 to 1). Some 5.3 comments get shorter by dropping the exact fix (e.g. "You assert this without showing how."), which the judge penalises.

### Cost

Held-out $10.87 ($0.0555 per answer, 20.6 s per answer). A1 check $1.67 ($0.83 marking + $0.84 judge). Total $12.55 against Om's $15 ceiling. OpenRouter eval-cap total moved from $32.85 to $44.55; the judge model has no `openai/` prefix, so its spend is outside that total.
