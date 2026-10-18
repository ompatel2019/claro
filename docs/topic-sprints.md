# Topic sprints

`/student/sprint` has four setup steps: question type, topics/subtopics, size,
then timer and feedback. Back preserves settings; Reset returns to defaults and
step one. Advanced on the last step contains history, difficulty, verbs, years
and sources. Start (including ⌘/Ctrl+Enter) is available after reviewing all steps.
The summary (marks, minutes, filters, live match count, Reset, Start and warnings)
is a normal in-flow block immediately below the step card on every step, with
the no-match empty state after the summary. It scrolls with the page, wraps on
narrow screens and never floats over the card.

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
The setup layout regression checks at 390px and 1280px verify that the summary
stays below the full step card before and after scrolling, including wrapped
filter text, a shortfall warning and expanded Advanced controls.

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

## Check as you go: model answer (S10)

Checking a written answer shows the mark, band, comments, full-mark outline and
the question's stored model answer, using the results page's `AnnotatedFeedback`.
`POST /api/attempts/:id/mark` adds `sample_answer` only in check-as-you-go
sprints and only once the written attempt is marked, excluding `No answer`
results; `loadSprint` reloads it only for those attempts in unfinished
check-as-you-go sessions. Marking guidelines, `check_status` and `mark_reviews` details
are never sent to the sprint view. Unit tests in `src/app/api/marking.test.ts`
and `src/lib/practice-data.test.ts` cover response and admin-read boundaries.
`e2e/sprint-model-answer.spec.ts` skips without `STUDENT_EMAIL` and mocks the
mark API; it covers UI behavior only, not real marking or server-side
model-answer reads.

## Background written marking

With feedback at the end, Submit answer or leaving an answered written question queues its marking
in the background (at most two calls at once). Answers stay editable. Changing
saved text, a transcript or photos clears the old mark; a worker can only store a
result for the answer version it claimed. Unchanged answers reuse their marks,
including when a background request races Finish. Existing rate limits and the
AI budget still apply to background calls. MC marking and check-as-you-go keep
their existing behaviour.

Background failures show no mid-sprint error. Finish saves the current answer,
waits for active calls, then marks queued/unmarked answers and retries failures.
It checks for live marking claims before finalizing. Abandoned claims
can be recovered after five minutes, longer than the per-answer route timeout.
Migration `0049_answer_version.sql` adds a database-maintained `answer_version`.
A BEFORE UPDATE trigger increments it whenever text, transcript, choice or photos
change, including saves by older code. Claims, deterministic marks, results and
claim releases compare that version; `claimed_at` identifies the worker only.
Legacy version 0 (and nullable legacy snapshots) remains supported.

`src/lib/sprint-mark-queue.test.ts` covers versions, failures, deduplication,
Finish and the two-call cap. Engine and mark-route tests cover conditional writes
and save permissions. `e2e/sprint-background.spec.ts` runs the real runner in a
synthetic browser harness with mocked auth/storage and intercepted marking and
Finish calls; it requires no account, database or paid API.

Finish passes the scored versions/statuses/marks/timestamps to a service-only
transaction that locks and re-reads the attempts before saving the score/summary.
A conflicting save causes re-marking, re-scoring and summary regeneration, with
at most three finalization attempts, then a clear retryable error. Written answer
saves take the same locks and recheck session-open: a save that loses to Finish
is rejected. Unchanged answers keep their marks and are not re-marked.

Disagreement reviews are inserted only after a successful result save, stamped
with its answer version. A database trigger locks/rechecks the attempt at insert,
uses `FOR NO KEY UPDATE` to allow concurrent legacy FK checks, discards
superseded reviews, and removes older unresolved `check_disagreed`
reviews (including legacy null versions) before the one-open-review index is
checked. A failed review insert leaves its own saved result retryable, guarded by
version, claim, marking timestamp and review status. Written answer saves also
remove superseded open auto reviews, even if the next mark agrees. Student
disputes, spot checks and resolved reviews are preserved.

0049 is written, **NOT applied to production**, and awaits Om/master sign-off.
Apply the migration before the new server code; reversing that order causes
missing-column/RPC errors for sprint saves, marking and Finish. Old callers
remain compatible after migration, but need the new code to gain the race fixes.
The migration was rerun and `supabase/tests/answer-version.sql` passed against a
disposable local PostgreSQL 17 cluster with stub tables. Separate local concurrent
lock probes exercised both save/Finish outcomes, stale reviews and competing
claims, plus legacy column grants and null/zero versions. A separate probe
reproduced the legacy-review FK deadlock with `FOR UPDATE` and verified its fix.
`supabase/tests/specs/answer-version-locks.spec` preserves that interleaving as a
local PostgreSQL isolation regression test with expected output. Engine/route tests mock
all database and model access. No remote database or paid calls were used.

The five-minute claim lease cannot prevent provider work continuing after a
worker times out. Autofill's daily allowance and the shared spend cap still use
logged usage rather than atomic reservations.

## Iteration 2 — Lane C: entry points and history

Home's Topic Sprint tile opens `/student/sprint`; Activity opens `/student/activity`. The one Home resume card links to the latest saved session through the shared canonical session helper. The S keyboard shortcut and first-visit welcome flow remain. Weak-topic practice belongs to Progress, linked beside the Home streak. Activity removes elapsed time from its compact rows and places the score next to each title; filtering and date/score sorting remain available. This lane does not change sprint setup, marking, results or prompts.
