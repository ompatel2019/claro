# Portal behaviour

Migration `0049_answer_version.sql` is written, **NOT applied to production**, and
awaiting Om/master sign-off. It adds atomic answer versions, guarded auto reviews
and transactional sprint answer saves/finalization. Deploy the migration before
the new server code: sprint saves, marking and Finish require its columns/RPCs
and fail if code is deployed first. Old callers remain compatible after migration.
Validation used mocked engine/route tests and a disposable local PostgreSQL 17
cluster with stub tables (migration rerun, rollback-only SQL assertions and
concurrent lock probes). No remote database access or paid calls were used.

## Review round 1: lane 4

- Flashcards: deck size and answer method follow Mode; Study supports drafts before self-rating. Existing list/repeat behaviour remains.
- Questions: imports create drafts offline. The app edits existing rows only; Topic and Subtopic are dependent selectors in the editor, bulk move and list/import filters.

Apply migration 0042 before serving these changes. Use Node 22 and export local/test variables. Run checks and Playwright through `Q_MIN_GB=3 Q_SLOTS=1 q-run` with one browser worker.

- Disputes: `request_mark_review` locks the student profile and changes review/attempt state atomically. `admin_dispute_history` aggregates all-time counts in SQL. Unchanged/lowered resolved marks count as rejections; limits are five per Sydney week, three open, one per answer, and a 48-hour rejection cooldown. Apply migration 0043 before serving this flow.

- Spend: bad costs become zero in totals; non-finite averages are hidden. `ai_usage.attempt_id` links individual mark/transcribe/retry calls through an async context. Buckets use stored maximum marks and distinct tracked marked answers. Historical/batch costs remain unallocated because the engine is outside this lane’s scope. Apply migration 0044 before deploying.

## Home and progress

Student Home (v2, 19 Oct 2026): greeting/date, a term/week hero with a daily line
and week-of-term dots, four large launch tiles (Topic Sprint, Flashcards with due
count, Mark my answer, Activity) beside "Your study days" (day/longest streak, days
studied, yearly heatmap with today marker, Light up today), then a Study hub tile per
topic opening a prefilled Topic Sprint. There is no Continue card on Home; unfinished
sessions are listed in Activity. Read failures keep the launch tiles usable. No
migration (existing `activity_days`/`activity_streaks`).
Coverage: `src/app/(app)/student/quick-start.test.tsx`, `e2e/pages.offline.spec.ts`
and `e2e/student-home.spec.ts`.

Progress weak topics use SQL history counts over its selected range. Topics below 60% qualify.
Progress focuses on
topic, question-type and directive-verb marks, followed by score history, weak spots
and flashcard mastery. Question weaknesses unlock after 3 marked answers across
2 distinct sessions in the selected range; skipped and unanswered attempts do not
count. Flashcard weaknesses retain their separate review history.
Migration 0051 (applied to production 19 Oct 2026) stops `student_progress` failing
with "field name must not be null" when history includes a non-live question.

## Brand

Real Claro lockup/mark SVGs live in `public/logos/` (white variants in dark theme);
the sidebar/header still use these lockup/mark SVGs. The tab/app icons
(`src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`) are the Claro
marketing-site icon copied byte for byte (full-bleed #e86239 tile, white C and dot);
`scripts/tab-icons.mjs` builds `favicon.ico` from it. The link preview is the student
card `public/og/claro-student-og.png` (`scripts/og-student-card.mjs`).

Migration 0047 adds distinct session counts to `student_progress`, including
parent topics without counting the same session twice across subtopics. The RPC
preserves existing overview totals for older deployed clients.

Validation: `src/lib/weak-topics.test.ts`, `src/lib/progress.test.ts`, the Progress
page tests and `e2e/progress.spec.ts`. The shared fixture signs in through the SSR
cookie API before opening the protected pages. `e2e/weak-topics.spec.ts` uses isolated synthetic
students to cover both pages at mobile and desktop widths: empty history, both
sample boundaries, the 60% boundary, practice links, invalid ranges, per-card load
errors and recovery, and an expired session. `supabase/tests/weak-topic-samples.sql` verifies SQL rollups, distinct
sessions, answer modalities, skipped/failed answers, user isolation and Sydney
range boundaries in a transaction that rolls back. Run checks and browsers
serially through
`Q_MIN_GB=3 Q_SLOTS=1 q-run` on the shared box.

The student and admin headers include a keyboard-accessible Dark mode toggle. The initial theme follows your system, and explicit choices are saved in this browser. Choose “Use system theme” in the account menu to reset it. A synchronous head script sets the theme before paint; panels, controls, charts and activity shades share light/dark tokens.

Theme validation: `e2e/theme.spec.ts` (student and admin toggle, persistence, system default, blocked storage, 360px and 1280px) runs with the normal Playwright config.

### A4: accuracy and dispute spam

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

## A5: A1 backlog calibration

The existing `a1-mock-questions.json` bank and private anonymised A1 export extend the separate 20-answer Karan benchmark, without bundling student scripts. Calibration already runs through `marking_examples_for_grader` and the same band anchors in grader, blind check and reconciliation. Test scripts remain in `marking_examples` with `split = 'test'`.

Engine → Eval runs now displays the latest full held-out backlog result. Exact means an identical human mark; agreement means the same guideline band and, for six or more marks, at most one mark apart. Failures and exclusions are omitted; newer partial runs and other eval sets cannot replace the full backlog summary. Offline JSON/Markdown reports include this metric separately from blind-check agreement.

The importer validates the entire export before database access. Its local dry-run has no database calls. Invalid snapshots and duplicate/benchmark answer text fail before writes; actual imports only upsert into Claro, never A1. Existing source hashes and the seeded split are preserved; no migration or import is needed for this code change.

Validation: snapshot/importer Vitest tests cover invalid data, reproducible splits and leakage; backlog card tests cover agreement boundaries, run selection, empty states and private content. Report tests distinguish human agreement from blind checks. `e2e/admin-marking-engine.spec.ts` covers the card, docs and runs on desktop/mobile without starting paid evals.
