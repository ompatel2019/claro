# MCQ explanations (S11)

Use the existing `questions.explanation` text column for a JSON-encoded object:

```json
{
  "concept": "A local content rule requires a minimum share of domestic inputs.",
  "why_correct": "Increasing that share reduces the use of imported inputs.",
  "distractors": {
    "A": "A tariff taxes imports rather than specifying domestic content.",
    "B": "An export subsidy supports exporters rather than setting domestic content.",
    "D": "An import quota limits quantities rather than setting domestic content."
  }
}
```

Content authors and ML rewrites should define the concept without assuming the
student already knows it, explain why the keyed option follows, then explain each
other option. Use the actual question and official key; do not infer a key from
an explanation. Include all three distractors and omit the correct option.
Paragraphs support the existing RichText Markdown. The UI adds “Thus the answer
is C.” using the trusted key, then displays the notes in A–D order. It filters out
any accidentally included note for the correct option. Partial distractor sets
render without invented notes. Draft previews accept empty paragraphs; malformed
shapes fall back to legacy text rendering.

This is a content format change, with no migration and no database writes required
for the portal implementation. Existing prose is preserved verbatim and is not
silently rewritten or sent to an AI while a student checks an answer. Bulk
regeneration of the existing bank remains the ML/content task identified in
Karan's feedback. Review those rewrites before importing them into this column.
The question editor offers “Use concept-first explanation”, keeps existing prose
as the correct-answer reasoning, and provides named fields for the concept and
option notes. Structured questions use these fields directly. Publishing requires
the concept, reasoning and all three distractor notes. Drafts may be incomplete.
The preview renders the same structured content; plain Markdown remains supported.

The mark API preserves `explanation` for existing consumers and adds validated
`structured_explanation` only on a successful check-mode MC mark. Unchecked,
foreign and exam-mode attempts cannot use that reveal path. On resume, the
server loads explanations only for marked MC attempts in the owned check-mode
session. No key fields are added to the general question projection.

Verification: `src/lib/mcq-explanation.test.ts`, `src/lib/practice-data.test.ts`,
`src/components/mcq-explanation.test.tsx`, `src/components/sprint-runner.test.tsx`,
`src/app/api/attempts/[id]/mark/route.test.ts` and `e2e/mcq-explanation.spec.ts`.
