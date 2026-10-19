# Portal behaviour

Migration `0051_progress_null_type.sql` (Progress no longer fails with "field name
must not be null" when history includes a non-live question) **is applied to
production** (19 Oct 2026, ~10:16pm Sydney).

Migration `0049_answer_version.sql` (atomic answer versions, guarded auto reviews,
transactional sprint answer saves/finalization) **is applied to production** and has
been live since 16 Oct. Migration `0050_mixed_min_5.sql` (lowers the Mixed sprint
minimum in `start_sprint` from 20 to 5 marks, S3) **is applied to production**
(applied 19 Oct 2026, Mixed minimum 5). The S9 criteria data fix is also **applied
to production**: 6 questions were repaired on 19 Oct 2026; the original rows were backed up
and later archived off-database (migration `0064`).

## Topic sprints and marking

S13: written-session Strengths and Top fixes describe observed writing habits (definitions, topic sentences, question focus, evidence and flow), citing specific questions as “Q3”, with one concrete action per Next steps item tied to a named question or topic. The summary uses the actual marked text; mixed-session MCQ choices are excluded from writing evidence. The summary states that MC answers are not supplied and makes no MC performance claims. One-answer advice cites that question without claiming consistency, and sparse evidence does not force invented habits. MCQ-only summaries and per-question feedback retain their existing behaviour. No migration is needed; stored summaries are not regenerated. See [the working writing rubric](../src/lib/ai/docs/WRITING-SUMMARY.md), including the pending Om/Karan review and model-quality limits. Regression coverage: marking prompt/engine Vitest tests, results component tests, and `e2e/writing-summary.spec.ts` (synthetic student, no AI calls).

Topic Sprint timers notify with a sound and an overtime banner; students always finish manually, including resumed legacy sessions.

Sprint pace defaults to 1 min per multi and 1.5 min per short-answer mark, both editable (0.25–10). Setup shows an estimate; the saved timer uses the actual selected questions. Apply migration `0039_sprint_pace.sql` before deploying these controls. The five-short-answer quick start estimates about 23 minutes.

Flag for review sits in the bottom answer actions alongside Check answer; flags still persist in the question booklet.

Topic sprints offer Multiple choice, Short answer and Mixed (MC + shorts). Essays
remain available in Mark my answer and existing results; they are excluded from
new sprints, including legacy saved setups. Legacy essay links/settings fall back to MC. Apply `0040_sprints_no_essays.sql`.
Sprint regression coverage: `src/lib/sprint.test.ts`,
`src/app/(app)/sprint-actions.test.ts`, `e2e/sprint-feedback.spec.ts` (mobile/desktop).
Use `Q_MIN_GB=3 Q_SLOTS=1 q-run` for checks and Playwright on the shared box.
Questions always run in exam order: MC first, then short answers. Existing
shuffled sprints resume in the same grouping. Apply `0041_sprints_exam_order.sql`.
Setup is a single page with question type, topics/subtopics, size, paper years,
timer and feedback. Custom reveals editable sizing, Adjust exam pace and Advanced
(history, difficulty, verbs and sources). The summary, Reset and Start stay in
page flow; valid settings can start with the button or ⌘/Ctrl+Enter. Reset restores
defaults. Settings persist under `claro.sprint.v1`; URL parameters override them.

Use Node 22 (`nvm use`). Local checks need `NEXT_PUBLIC_APP_URL` set; authenticated Playwright tests additionally use synthetic `STUDENT_EMAIL` / `STUDENT_PASSWORD` and the Supabase settings from `.env.local`. Progress specs create isolated synthetic accounts. Never commit credentials.

In check-as-you-go sprints, Next shows a reminder on hover or focus for an unchecked answer and highlights Check answer. Navigation remains available.

Written checks show the saved marked answer, all comments and the full-mark outline inline using the same feedback as results. Wide screens have margin comments; small screens stack them. Once a non-empty written answer is marked in check-as-you-go mode, the mark API also returns the question's stored model answer (read server-side; no new AI call, no schema change), and the inline view shows it under **Model answer** exactly as results do; resuming the sprint reloads it. Marking guidelines and second-check/review details are not shown inline; they stay in finished results. Unit coverage: `src/app/api/marking.test.ts`, `src/lib/practice-data.test.ts` and `src/components/sprint-runner.test.tsx`. `e2e/sprint-model-answer.spec.ts` skips without `STUDENT_EMAIL` and mocks the mark API; it covers UI behavior only, not real marking or server-side model-answer reads.

Mark my answer defaults to the Claro bank. Set the server flag `ENABLE_OWN_QUESTION_MARKING=true` to show My own question. The flag is off by default and also gates new own-question checks on the server; saved own-question sessions still resume and mark. Own questions require clear, complete mark bands: unreliable criteria return a short note with no score; valid criteria receive an estimated mark without tutor examples. Similar-topic example retrieval is out of scope. Stale unsaved own-question drafts keep their answer text and require a bank selection.

## Flashcards

Deck size (20 selected by default) and Answer by sit beside Mode. The summary and Start button sit at the bottom after all setup sections, including Source, and scroll with the page without covering options. Study lets students type or speak before flipping and self-rating; Test checks their answer. Typing remains available if speech is unsupported or denied. List view and missed-card repeats remain available.
Tests: `src/components/flashcard-{builder,runner}.test.tsx`, `e2e/flashcard-{builder,session}.spec.ts` cover setup, bounds, empty decks, answer drafts, speech fallback, repeats and mobile/desktop flows. Run heavy checks through `Q_MIN_GB=3 Q_SLOTS=1 q-run` on the shared box.

## Admin dashboard (Karan A1)

A1 in `/workspace/claro/karan-items.md` explicitly says to keep the dashboard as-is,
especially AI spend per day. The four KPIs and 30-day sessions/spend charts retain their existing metrics;
attention links and the three-session mini-list are described below.
Dashboard numbers come from the admin-only `admin_dashboard` SQL RPC; each chart
lets admins inspect a Sydney day using its graph or keyboard-accessible selector.
No migration or runtime change is needed for A1.

Regression coverage: `src/app/admin/page.test.tsx`, `src/lib/admin-data.test.ts`
and `src/components/daily-chart.test.tsx` cover totals, zero/empty states, spend
caps, permissions, errors and daily inspection. `e2e/admin-dashboard.spec.ts`
checks the authenticated dashboard and chart controls on desktop and mobile.
Run `q-run npm run check` and
`q-run npm run test:e2e -- e2e/admin-dashboard.spec.ts --workers=1` with public
app/Supabase settings and synthetic `ADMIN_EMAIL` / `ADMIN_PASSWORD` exported.

## Question imports

Questions enter through offline import scripts as drafts; the bank's Import action opens Import review. Manual creation is closed. Existing drafts and published questions remain editable, with numbered Topic then Subtopic selectors (also used for bulk moves and import-review filters). Tests in `e2e/admin-questions.spec.ts` and the question editor/page/action unit suites cover import review, editing, validation, errors and responsive layouts.

## Mark reviews

Students select **Question this mark** beside written feedback on finished results and give a 10–1,000 character reason. Limits: one request per answer, three open, five per Sydney Monday–Sunday week, and 48 hours after an unchanged/lowered review. An atomic RPC enforces the limits; the admin queue shows all-time history and rejection rates based on resolved disputes. Duplicates return 409, limits and the cooldown return 429, and only real failures return 503. Apply `0043_dispute_guardrails.sql` and `0045_dispute_limit_statuses.sql` before deploying.

Tests: dispute route/dialog/history unit suites and `e2e/dispute-guardrails.spec.ts` cover concurrent caps, cooldown expiry, invalid/foreign attempts, errors, and mobile/desktop queue/results flows using isolated synthetic accounts.

## AI spend by mark value

Spend shows maximum-mark bands (1–2, 3, 4, 5–6, 7–8 and 9+). Individual marking, retries and transcription log their attempt ID; averages divide linked costs by distinct tracked marked answers. Historical and batch-engine calls lack that link and remain explicitly unallocated. Invalid/non-finite costs display safely. Apply `0044_usage_attempt_attribution.sql` before deploying; the marking engine remains unchanged.

Tests: spend data/page/helpers, loader, async-context and usage-logging unit suites; `e2e/admin-spend.spec.ts` and `e2e/spend-mark-values.spec.ts` cover bucket boundaries, malformed/free/untracked costs, empty ranges and mobile/desktop layouts.

Mixed sprints link MC question count and short-answer marks to the selected total.
Changing the total starts an even split (an odd mark goes to MC); reload
keeps an edited split. Buckets fill independently, with whole shorts nearest their
target within the existing two-mark tolerance where possible. Timer estimates
use the split and editable pace; saved timers use the actual selected marks.
Apply `0046_sprints_mixed_buckets.sql`. Coverage adds `e2e/sprint-mixed.spec.ts`
(mobile/desktop, exact fills, zero buckets, shortfalls and invalid RPC input) and
`supabase/tests/sprint_mixed.sql` (transactional selection regression).

## Progress

Student Home (`src/app/(app)/student/page.tsx`) shows a greeting/date, term/week
progress on desktop and Review cards / Start sprint actions. It loads HomeStats,
HomeAverage, Today's plan, Study hub, Your study days, lost marks, recent activity
and HomeAsk independently with Suspense fallbacks. Today's plan can include
Finish your last sprint, using the shared canonical session helper, alongside due
cards and weak-topic practice. Read failures leave the launch actions usable.
Your study days uses the yearly heatmap with today's marker, streak statistics and
Light up today (due flashcards when available, otherwise Topic Sprint). Existing
`activity_days` and `activity_streaks` RPCs supply activity; no migration.
Coverage includes `src/app/(app)/student/quick-start.test.tsx`, `src/lib/home.test.ts`,
`e2e/pages.offline.spec.ts` and `e2e/student-home.spec.ts`.

Brand: `public/logos/` holds the marketing-site lockup and mark SVGs (white variants
in dark theme via `src/components/logo.tsx`); the lockup is used in the sidebar,
mobile header, auth pages and marking screen. Logo pairs the lockup with
`claro-tile.svg`; the collapsed sidebar uses the tile alone.
The tab/app icons (`src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`)
are the claro-marketing site's icon copied byte for byte (full-bleed #e86239 tile,
white C and dot); `scripts/tab-icons.mjs` builds `favicon.ico` from `icon.svg`. The sidebar/header use the
tile and lockup SVGs.
`public/og/claro-student-og.png` (generated by `scripts/og-student-card.mjs`) is the
Open Graph/Twitter image (`src/app/layout.tsx`).

Progress leads with topic,
question-type and directive-verb breakdowns, then score history and flashcard mastery.
Question weak spots require 3 marked answers across 2 distinct sessions per subtopic;
apply migration 0047 before using the new history counts. Missing counts keep spots locked.

Run checks serially on the shared box with `Q_MIN_GB=3 Q_SLOTS=1 q-run npm run check`.
Export the public app/Supabase env first, or load `.env.local` with
`q-run node --env-file=.env.local /usr/bin/npm run check` on this box.
Run browser coverage with the same queue settings and `q-run npx playwright test e2e/weak-topics.spec.ts e2e/progress.spec.ts --workers=1`.
The weak-topic specs create and delete isolated synthetic students using Supabase env
credentials. Progress specs use the same isolated fixture. Load `.env.local` when
invoking Playwright (for example,
`q-run node --env-file=.env.local node_modules/@playwright/test/cli.js test e2e/weak-topics.spec.ts --workers=1`).
Database assertions in `supabase/tests/weak-topic-samples.sql` run against a
disposable local database after migration 0047; fixtures and all their writes roll back.

The student and admin headers include a keyboard-accessible Dark mode toggle. The initial theme follows your system, and explicit choices are saved in this browser. Choose “Use system theme” in the account menu to reset it. A synchronous head script sets the theme before paint; panels, controls, charts and activity shades share light/dark tokens.

## Marking accuracy (A4)

The Accuracy page distinguishes current checker agreement from human verification.
Its admin-verified figure uses exact AI/final agreement only for written
`spot_check` / `check_disagreed` reviews resolved by an admin in range, with both
marks present and finite. Student disputes never enter this sample, even after
resolution. The caption exposes its count and selection bias; empty samples show
“No admin-verified answers yet”. Offline held-out eval remains separate.

Only dispute-derived metrics (weekly counts, override rate and delta breakdowns)
exclude currently blocked students (`banned_until > now`) and repeat disputers
(3+ resolved all-time disputes and at least 50% unchanged/lowered, matching A3).
The loader pages Auth users and resolved dispute history and fails on read errors;
identifiers remain server-side. Exclusions never hide staff-initiated reviews.
Checker-status charts remain a current snapshot and may change during reviews,
as the accessible Check agreement tooltip explains. No migration is needed.

## A1 mock calibration (A5)

The A1 bank covers 41 questions and the anonymised export contains 2,203 human-marked answers (196 held out, 2,007 calibration examples). Private scripts stay outside git; A1 is read-only.

The existing `a1-mock-questions.json` bank and private anonymised A1 export extend the separate 20-answer Karan benchmark, without bundling student scripts. Calibration already runs through `marking_examples_for_grader` and the same band anchors in grader, blind check and reconciliation. Test scripts remain in `marking_examples` with `split = 'test'`.

Engine → Eval runs now displays the latest full held-out backlog result. Exact means an identical human mark; agreement means the same guideline band and, for six or more marks, at most one mark apart. Failures and exclusions are omitted; newer partial runs and other eval sets cannot replace the full backlog summary. Offline JSON/Markdown reports include this metric separately from blind-check agreement.

The importer validates the entire export before database access. Its local dry-run has no database calls. Invalid snapshots and duplicate/benchmark answer text fail before writes; actual imports only upsert into Claro, never A1. Existing source hashes and the seeded split are preserved; no migration or import is needed for this code change.

Validation: snapshot/importer Vitest tests cover invalid data, reproducible splits and leakage; backlog card tests cover agreement boundaries, run selection, empty states and private content. Report tests distinguish human agreement from blind checks. `e2e/admin-marking-engine.spec.ts` covers the card, docs and runs on desktop/mobile without starting paid evals.

Validate an anonymised export locally before importing into Claro:

```bash
npx tsx --conditions=react-server src/lib/ai/eval/import-a1-examples.mts /path/to/snapshot.json --dry-run
```

Dry-run needs no credentials and makes no database calls. It rejects invalid marks, unknown questions, duplicate hashes, repeated answer text and overlap with the separate `a1-eval-set.json` benchmark. The seeded split and existing grader view keep held-out scripts out of prompts. See [ENGINE](../src/lib/ai/docs/ENGINE.md) for offline evaluation and import details. No new migration is required for A5.

MCQ explanations support concept-first feedback in checked sprints, resumed checks,
finished results and the admin preview. Structured content is stored as JSON text
in the existing `questions.explanation` column; legacy Markdown still renders.
The mark API adds `structured_explanation` after an owned check-mode answer is
locked. No schema change or migration is needed. See [the MCQ content contract](mcq-explanations.md).
Coverage: parser, shared renderer, sprint runner, owned-session loader and mark API
Vitest suites; `e2e/mcq-explanation.spec.ts` exercises real marking, key withholding,
resume, correct/wrong/unanswered results and mobile/desktop layouts with temporary
synthetic students/questions. Run with the same queue and env settings above.
E2E fixtures refuse non-local Supabase URLs unless the project ref is listed in `E2E_TEST_SUPABASE_REFS` (see `e2e/guard.ts`).

Own-question suggestions: set `ENABLE_OWN_QUESTION_MARKING=true` and `ENABLE_OWN_QUESTION_AUTOFILL=true` (exact lowercase values). Autofill runs once on leaving a changed question of at least 10 characters. It suggests the topic, marks, directive verb and complete mark bands; student edits are preserved. Changing the question re-detects the verb, including after draft restore. Empty guidelines are generated server-side before marking; failures leave a saved answer with Retry. With autofill off, the existing criteria requirement applies.

Autofill uses the existing cheapest priced model, `openai/gpt-6-luna`, through OpenRouter (`MODELS.ownQuestionAutofill`). It validates topics and complete band coverage, retrying invalid output once. A separate allowance checks for 10 logged model calls per student per Sydney day, including retries and submit fallbacks; it does not use the 20 marking checks. It follows the existing usage-count rate-limit pattern (concurrent requests can race the count). Calls use the shared spend cap and log tokens and USD to `ai_usage` as `own-question-autofill`; no migration is required. Tests mock all model calls. Run the credential-free browser regressions with `q-run npx playwright test --config=e2e/own-question.config.ts` (read-only local auth/data double).

The checks-left card now sits in page flow. The desktop (lg+) feedback button is `position: fixed` bottom-right so it adds no document height: student home no longer scrolls at 1366×768 or 1280×720 (`e2e/pages.offline.spec.ts`). Desktop content keeps `lg:pb-12` clearance. Phones use the header icon. The student bottom-position audit found no other content bars to remove; admin review controls and dialog/sheet overlays retain their positioning.

## Iteration 2 — Lane A: S3

Mixed sprints accept a five-mark minimum. Size inputs keep the entered value and show an inline range hint; invalid totals block Start instead of silently snapping on blur. Presets and saved settings use the same limits.

## Iteration 2 — Lane A: S2

The unfinished-sprint banner shows the actual Finish server error, catches network/non-JSON failures, prevents duplicate submissions, and offers View results on failure. A read-only session check recovers straight to results when the server finished despite a lost response. Reset remains a local setup reset. Synthetic browser tests never call real marking.

## Iteration 2 — Lane A: S6

Runner Finish failures check the session’s finished state before showing an error, recovering to results after a lost response. Unfinished failures keep answers editable, show the real error and a View results recovery link. The setup banner links to results when every attempt is marked. All-marked attempts alone do not trigger an automatic finish. Engine timing is unchanged.

## Iteration 2 — Lane A: S4, S5 and S12

Feedback is presented as Check as I go and Exam mode controls with dot-point descriptions. Stored values remain `each` and `end`, with no timer or migration change. The runner, banner Finish and Mark my answer submission share one simple full-page Claro marking screen. It uses polite status announcements and respects reduced motion, with no invented progress percentages. Mark my answer keeps its form mounted and draft intact during submission; its background marking/navigation flow is unchanged.

## Iteration 2 — Lane B: feedback guards (S8, S9, S10, S13)

Student margin comments no longer repeat the per-comment “Next mark” line;
its stored value, admin editor and aggregate next-mark summary remain intact.
“How to reach full marks” is hidden for full-mark written answers in both sprint
and single-answer results. Rubric tables and band labels require complete,
non-overlapping integer coverage of 1..marks (an optional zero band is accepted).
Incomplete tables show an unavailable message. Bank single-answer reports use a
score ring and Your next mark advice/rewrite card rather than the sprint outline.
The normal admin Questions
“Missing or incomplete criteria” filter finds missing bands before pagination.
Import review retains its existing missing-criteria filter. No data repair,
migration or marking/prompt change is included.

## Iteration 2 — Lane B: results next steps and date (S7, S11)

Your next step leads Overall feedback before the answer browser, alongside
Strengths and fixes on wide screens. Missed MC answers offer Retry mistakes;
up to two topics with lost marks show topic scores, lost-question numbers,
Practise and available Review cards links. The answer browser selects individual
questions using buttons. Pending and unavailable summaries retain these
deterministic actions. The sprint header shows the Sydney calendar date without
clock time; elapsed sprint duration remains. Stored summaries and prompts are unchanged.

Run the isolated, read-only results browser suite with
`Q_MIN_GB=3 Q_SLOTS=1 q-run npm run test:e2e -- --config=e2e/sprint-results.config.ts`.
It starts local Next/Supabase doubles, blocks marking/writes, and covers mobile,
desktop and single-answer feedback. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when
using system Chrome. Credential-dependent legacy specs are skipped without a
configured test student. Never point these tests at production.

## Iteration 2 — Lane C: pages (S1, S11, A1, A2)

Activity puts the score beside the title with a kind icon and date, hides finished status, and removes duration, item and action columns and the KPI card row. Existing newest-first ordering, filters, pagination and canonical report links remain.

The admin dashboard promotes clickable Needs attention above charts and replaces the ten-row table with at most three recent sessions linking to the student's Sessions activity/report. Admin flashcard filters offer parent Topic followed by its Subtopic; changing parents clears stale subtopic selections. No database or marking changes.

Validation: `Q_MIN_GB=3 Q_SLOTS=1 q-run npm run check`; offline browser coverage uses `q-run npm run test:e2e -- --config=e2e/pages.config.ts` (real pages/components and compiled app CSS, synthetic reads, installed Chrome). Credential-based home/activity/admin specs also cover the revised UI; use an isolated allow-listed test Supabase only.

### Iteration 3 — small fixes

- Results while Finish is still marking: `finished_at` is only set once marking and the summary complete, so the results URL used to redirect to the question page. It now shows a "Marking in progress" state with the usual progress bar (auto-refreshing) while an answer has a fresh `marking` claim (or, in exam mode, once any answer is marked), and fills in when done. With no marking in flight it still redirects to the question page. No migration.
- Results page stuck blank after marking (follow-up to the above): in exam mode (`feedback: end`) the in-progress state holds until `finished_at` is set, but the progress card only polled while an answer was still `marking`, so a second tab went blank once all answers were marked and stayed so until manual reload. The in-progress card now keeps refreshing (every 2 s, 5 s after 30 s, stopping after 10 min) until the server render is no longer in progress, refreshes immediately when marked reaches total, and shows "Finishing your results…". If every answer is marked but `finished_at` is still unset after 15 s (marking tab closed), the page calls the existing idempotent `POST /api/sessions/[id]/finish` once, which finalises the session. No schema change. Tests: Vitest (`marking-progress.test.tsx`) and offline Playwright (`sprint-feedback.spec.ts` with timed mock sessions 0007/0008 in `e2e/sprint-results-mock.mjs`).
- Admin flashcards Add, Edit and Move dialogs: review found the single "Topic · Subtopic" list was ordered by raw `sort`, which restarts per topic, so subtopics from different topics interleaved. `subtopicOptions` now groups them by topic order. Selecting, saving and moving were otherwise correct (server validates a subtopic). Covered by Vitest (ordering, Add save, Edit save/change topic, Move); the admin page needs the service role, so no offline Playwright exists for it, and no production data was written to verify.

## Mixed allocation contract

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

## Additional contracts

The S keyboard shortcut and first-visit welcome flow remain. Activity lists
unfinished sessions and uses canonical report links. Historical lane descriptions
of a four-tile Home, rotating daily line and standalone resume card are superseded
by the current Home sections described above.

Progress topics below 60% qualify as weak. Skipped and unanswered attempts do not
count toward the 3-answer/2-session threshold; flashcards use separate review
history. Migration 0047 aggregates parent topics without counting a session twice
and preserves overview totals for older clients. The rollback-only
`supabase/tests/weak-topic-samples.sql` covers modalities, isolation and Sydney ranges.

Own-question gates cover new creation, marking and transcription; saved legacy
sessions remain readable. Ambiguous/malformed bands are rejected, rubric restrictions
reach prompts, and an admin final mark clears unreliable feedback.

School dates use NSW Eastern division student attendance dates for [2026](https://education.nsw.gov.au/schooling/calendars/2026) and [2027](https://education.nsw.gov.au/schooling/calendars/2027), checked 19 October 2026. Weeks start Monday (a midweek return is Week 1); dates outside the supported terms return no school week (Home shows NSW school holidays). School-specific/Western division exceptions are not personalised.

See [the annotated feedback contract](annotated-feedback.md) and [the MCQ content contract](mcq-explanations.md) for dedicated rendering rules.
