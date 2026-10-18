- S8: sprint expiry keeps answers editable and shows overtime until manual finish; the automatic finish setting is removed.

- S7: editable multi/short pace replaces flat custom minutes; `start_sprint` computes time from the actual selection. Legacy saved setup pace is reset to the new defaults.

- S9: flagging moved from the question header to the answer action row. Keyboard and persistence behavior are retained.

- S12: unchecked answers get a Next tooltip and highlighted Check action; navigation remains available and keyboard checking ignores empty or already-checking answers.

- S10 UI: inline written feedback reuses AnnotatedFeedback and the existing mark payload without an extra marking pass. Stored model answers are returned and reloaded only for marked written answers in unfinished check-as-you-go sprints, excluding No answer results. Guidelines and checker/review metadata remain in results. The Playwright model-answer spec requires STUDENT_EMAIL and mocks the mark API; server read boundaries have unit coverage.

- S16: validated own-question criteria, deterministic no-score feedback for unreliable rubrics, and estimated marking without example retrieval; server gates reject own-check creation, marking and transcription when off; restrictions reach prompts, ambiguous/malformed bands are rejected, and admin final marks clear unreliable feedback. UI: own questions are hidden by default behind ENABLE_OWN_QUESTION_MARKING; empty-state copy suggests search/filter changes. Schema and API are retained, and saved legacy sessions remain readable.

- S11: one concept-first MC explanation renderer is shared by inline checks,
  resumed checks, results and previews. Structured JSON text is supported alongside
  legacy Markdown; the owned mark API adds validated structured fields. No schema
  change. Existing bank prose still needs the separately tagged ML/content rewrite.

## Iteration 2 — Lane B (results and feedback)

Implemented S7 UI only, S8 per-comment removal, S9 rubric coverage guard and normal
admin list completeness filter, S10/S13 full-mark outline hiding, and S11 results
header date only. No prompt/engine edits, migrations, data repairs, paid marking,
benchmarks or production access. See `docs/annotated-feedback.md` and
`docs/topic-sprints.md` for behaviour and local browser-test instructions.

Import-review criteria filtering remains backed by its existing RPC (missing
criteria only); extending that RPC would need work beyond this no-migration lane.
Production screenshot/Claro Docs publication and prompt accuracy/leniency work
remain for the integrator and claro-ml. Local fixture screenshots are generated
under `test-results/` by the results browser spec.
