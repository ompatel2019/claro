# Topic sprints

`/student/sprint` has four setup steps: question type, topics/subtopics, size,
then timer and feedback. Back preserves settings; Reset returns to defaults and
step one. Advanced on the last step contains history, difficulty, verbs, years
and sources. Start (including ⌘/Ctrl+Enter) is available after reviewing all steps.
The live pool count and summary remain visible throughout.

New sprints contain MC, short answers or both. Essays remain reviewable in old
sessions and available through Mark my answer; their separate practice route is
future work. Old essay setup links/saved settings fall back to MC. New and resumed
sessions use MC-first exam order; question selection still varies between runs.

Apply `0040_sprints_no_essays.sql`, then `0041_sprints_exam_order.sql`. Both retain
caller permissions and authenticated-only execution. Setup persists under
`claro.sprint.v1`; URL parameters override saved choices.

Regression tests: `src/lib/sprint.test.ts`, `src/lib/practice.test.ts`,
`src/app/(app)/sprint-actions.test.ts`, `src/components/sprint-setup.test.tsx`,
`e2e/sprint-feedback.spec.ts` and `e2e/sprint-setup.spec.ts`. Playwright requires a
synthetic student account via `STUDENT_EMAIL`/`STUDENT_PASSWORD`; session cleanup
uses `SUPABASE_SECRET_KEY`. Never commit credentials. Run checks and browsers
through `Q_MIN_GB=3 Q_SLOTS=1 q-run` on the shared box.

## Mixed allocation

The two inputs are `mcq_count` and `short_marks`; their sum is `target`. Zero is
allowed in either bucket. Totals/presets start an even split, with an odd mark
assigned to MC. Saved splits are restored, and invalid or obsolete saved fields
are removed. New mixed sessions store both requested and actual bucket counts;
other modes omit these unused fields so Same setup again remains valid.

`0046_sprints_mixed_buckets.sql` fills MC independently, then finds the closest
attainable short total from whole questions, aiming within ±2 marks. It favours
an exact fill and an undershoot on equal distance. A zero bucket stays empty;
missing MCs never become extra shorts. Candidate priority still prefers unseen
questions. This handles the greedy failure where an unseen 8-mark question
blocks the seen 5 + 4 combination for a 9-mark target.

`e2e/fixtures/sprint-bank.ts` creates and removes a synthetic bank/history;
`e2e/sprint-mixed.spec.ts` checks the UI, selected attempts and server errors at
400px and 1280px. `supabase/tests/sprint_mixed.sql` runs in a transaction and rolls
back all fixtures and sessions. Set `claro.test_student_id` to a valid synthetic
student UUID locally in that transaction before running it; never use a real
student. Apply the migration first, or include it inside the test transaction.
