# Comment rules

See [ENGINE](/admin/marking/engine?tab=docs&doc=ENGINE) for comment shape, counts, comment-kind validation, retries and quote anchoring.

## Prompt rules

The prompt in `src/lib/marking/prompts.ts` requires:

- `quote`: the shortest phrase that makes the point, copied character for character, never paraphrased or a whole paragraph.
- `body`: 1–2 concise sentences speaking directly to the student, in Australian English. Use “you”/“your” or a clear imperative (“Try”, “Explain”). Name the specific strength or change in a warm, plain, direct tone; apply the same voice to `next_mark`.
- Avoid stock openings and boilerplate: “This demonstrates”, “The response”, “The student”, “Overall”, “It is important to note”, “Consider”, “well done”. Specific praise should say what you did well.
- `COMMENT_VOICE_EXAMPLES` in `prompts.ts` holds five editable, original, anonymised A1-style examples. They guide voice only, never marking requirements or answer content.
- `next_mark`: the specific change that earns the next mark, on fixes only; null on strengths.
- At least one strength and one fix unless full marks, then strengths only. Phrase advice as what earns the next mark, rather than what the student “should have” done.
- `earned` and `missing_points`, plus **3–6** `better_answer_outline` bullets. Each bullet names a concrete addition or change answering the question as asked; a “how” question needs mechanism steps, rather than sample-answer content.
- In Analysis comments and `better_answer_outline`, request judgement or a conclusion only for assess, evaluate, to what extent, justify or discuss. Never request either for how, explain, describe, outline, identify or analyse unless explicitly asked. These rules apply to full feedback; check-mode instructions are unchanged.
- `why_not_higher` and advice for reaching the next band in `next_band`; an empty `next_band` at full marks.

## Tags

| Tag         | Prompt meaning                                     |
| ----------- | -------------------------------------------------- |
| Verb        | Meeting the directive verb.                        |
| Knowledge   | Accuracy of economic concepts.                     |
| Evidence    | Statistics, examples and data.                     |
| Analysis    | Cause-and-effect links; judgement only when asked. |
| Terminology | Precise economic terms.                            |
| Structure   | Organisation, focus and length.                    |

See [VERB-GUIDE](/admin/marking/engine?tab=docs&doc=VERB-GUIDE) for directive meanings.

## Enforcement gaps

The strict schema in `src/lib/marking/schemas.ts` checks field types, kinds, tags and counts. It does **not** enforce sentence counts, shortest quotes, meaningful bodies, Australian English, tag suitability or an empty `next_band` at full marks.

`validateGrade` in `src/lib/marking/grade.ts` does not require a strength at zero or prohibit fixes at full marks. It does not check advice quality. If the first grader still fails validation after correction, its comments are retained and `feedback.validated` is false. This field records only the first grader's validation result; validation failures in the checker or reconciler do not change it (`src/lib/marking/engine.ts`).

## Display and edited feedback

`readComments` in `src/lib/feedback.ts` accepts legacy `comment`/`type` fields, drops empty bodies, treats non-strength kinds as fixes and turns unknown tags into null. It verifies that the stored offset and quote still exactly match the displayed answer; stale anchors move to “Overall”. It also assigns display numbers to comments.

`nextMarkLine` uses an explicit saved `next_mark_line` first. Otherwise full marks show “Full marks. Nothing missing.”; below full marks it uses the first ordered fix with advice, falling back to `next_band`.

`src/components/annotated-feedback.tsx` shows kind, tag, body and fix advice, links comments to text highlights, groups unanchored comments under “Overall”, and exposes the outline under “How to reach full marks”.

Admin edits in `src/app/admin/marking/review/actions.ts` have separate limits: up to 100 comments, quote up to 20,000 characters, trimmed non-empty body up to 4,000, and next-mark text up to 4,000. New comments require an exact selected quote/offset and a tag; changed legacy comments require a tag. AI count and strength/fix requirements are not applied to these edits.

## Offline tone report

`scripts/eval/tone.ts` reports the share of non-empty comments containing a stock phrase, second-person address (`you`/`your` or a recognised sentence-start imperative), and third-person references (“the student”/“the response”). Phrase and imperative lists are editable. Matching ignores case and repeated whitespace, uses word boundaries, and counts each comment once per metric; rates can overlap. Empty samples return null rates.

The eval report includes a pooled run summary in JSON, Markdown and console output, excluding fixture exclusions. It prefers structured comment bodies plus `next_mark`, never quotes. For older text feedback, it extracts numbered rendered comments; unstructured feedback counts as one comment. These are free lexical indicators, not a judgement of feedback quality; the imperative list is deliberately finite.
