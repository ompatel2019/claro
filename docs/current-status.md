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

## Iteration 2 — Lane C (19 October 2026)

- **S1:** compact student Home, four launch tiles, term/week banner, rotating original study lines, due count, streak, one resume card. Home uses streak-only rather than a year heatmap. Weak topics and score history are available through Progress. Progress's session chart remains in `score-trend.tsx`; its Home-only daily chart is removed.
- **S11:** two-column Activity list (title/score/status as needed, date); no durations or KPI cards. Row and keyboard-accessible title links open the existing reports. Newest-first remains the default and other sorts stay in the filter.
- **A1:** full-width Needs attention appears directly after stats, before charts. Its existing conditions and destinations are retained. Recent sessions is a three-row mini-list; links use the actual student Sessions/report query parameters.
- **A2:** parent-only Topic and dependent Subtopic filters. A valid child narrows the selected parent; stale/unrelated children are ignored and removed from displayed filter values. Existing add/edit/move dialogs belong to another file and are recorded as a follow-up in Lane notes.

School dates use NSW Eastern division student attendance dates for [2026](https://education.nsw.gov.au/schooling/calendars/2026) and [2027](https://education.nsw.gov.au/schooling/calendars/2027), checked 19 October 2026. Weeks start Monday (a midweek return is Week 1); holidays show School break, unsupported years show Your study week. School-specific/Western division exceptions are not personalised.

The offline Playwright suite exercises real page/component code with synthetic data and the app CSS; it performs no Supabase or AI calls. Authenticated specs require isolated test credentials. No live production screenshots or Claro Docs writes were performed from this lane.

## Production status (19 Oct 2026)

- Migration 0050 (Mixed sprint minimum 5) is applied to production.
- The S9 criteria data fix is applied to production: 6 questions repaired, backup in `public.questions_criteria_backup_20261019`.

## Iteration 3 — small fixes

- Results while Finish is still marking: `finished_at` is only set once marking and the summary complete, so the results URL used to redirect to the question page. It now shows a "Marking in progress" state with the usual progress bar (auto-refreshing) while an answer has a fresh `marking` claim (or, in exam mode, once any answer is marked), and fills in when done. With no marking in flight it still redirects to the question page. No migration.
- Admin flashcards Add, Edit and Move dialogs: review found the single "Topic · Subtopic" list was ordered by raw `sort`, which restarts per topic, so subtopics from different topics interleaved. `subtopicOptions` now groups them by topic order. Selecting, saving and moving were otherwise correct (server validates a subtopic). Covered by Vitest (ordering, Add save, Edit save/change topic, Move); the admin page needs the service role, so no offline Playwright exists for it, and no production data was written to verify.
