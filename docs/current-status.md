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

## Iteration 2 — Lane A: S3

Mixed sprints accept a five-mark minimum. Size inputs keep the entered value and show an inline range hint; invalid totals block Start instead of silently snapping on blur. Presets and saved settings use the same limits.

## Iteration 2 — Lane A: S2

The unfinished-sprint banner shows the actual Finish server error, catches network/non-JSON failures, prevents duplicate submissions, and offers View results on failure. A read-only session check recovers straight to results when the server finished despite a lost response. Reset remains a local setup reset. Synthetic browser tests never call real marking.

## Iteration 2 — Lane A: S6

Runner Finish failures check the session’s finished state before showing an error, recovering to results after a lost response. Unfinished failures keep answers editable, show the real error and a View results recovery link. The setup banner links to results when every attempt is marked. All-marked attempts alone do not trigger an automatic finish. Engine timing is unchanged.

## Iteration 2 — Lane A: S4, S5 and S12

Feedback is presented as Check as I go and Exam mode cards with dot-point descriptions. Stored values remain `each` and `end`, with no timer or migration change. The runner, banner Finish and Mark my answer submission share one simple full-page Claro marking screen. It uses polite status announcements and respects reduced motion, with no invented progress percentages. Mark my answer keeps its form mounted and draft intact during submission; its background marking/navigation flow is unchanged.

### Lane A integration dependency — S3

The setup accepts five Mixed marks, but the existing `start_sprint` RPC in migration 0046 still enforces a 20-mark Mixed minimum. Lane A does not change SQL or add a migration. Starting a five-mark Mixed sprint requires the database owner to resolve this separately; the synthetic tests exercise UI/config behaviour only.
