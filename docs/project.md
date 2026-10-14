# Portal behaviour

## Review round 1: lane 4

- Flashcards: deck size and answer method follow Mode; Study supports drafts before self-rating. Existing list/repeat behaviour remains.
- Questions: imports create drafts offline. The app edits existing rows only; Topic and Subtopic are dependent selectors in the editor, bulk move and list/import filters.

Apply migration 0042 before serving these changes. Use Node 22 and export local/test variables. Run checks and Playwright through `Q_MIN_GB=3 Q_SLOTS=1 q-run` with one browser worker.

- Disputes: `request_mark_review` locks the student profile and changes review/attempt state atomically. `admin_dispute_history` aggregates all-time counts in SQL. Unchanged/lowered resolved marks count as rejections; limits are five per Sydney week, three open, one per answer, and a 48-hour rejection cooldown. Apply migration 0043 before serving this flow.

- Spend: bad costs become zero in totals; non-finite averages are hidden. `ai_usage.attempt_id` links individual mark/transcribe/retry calls through an async context. Buckets use stored maximum marks and distinct tracked marked answers. Historical/batch costs remain unallocated because the engine is outside this lane’s scope. Apply migration 0044 before deploying.

## Home and progress

Student Home always shows the Topic Sprint presets and Flashcards launch boxes
immediately below the header, including the due count (zero when none are due).
Summary stats, activity heatmap, score trend/recent activity and unfinished
sessions/weak topics follow. Continue appears only when there are unfinished
sessions; loading failures keep the launch boxes available with a retry for the
unavailable due count. No migration is needed for this layout.
Coverage: `src/app/(app)/student/quick-start.test.tsx` and `e2e/student-home.spec.ts`
(empty history, unfinished sessions and due cards at 360px and 1280px).

Home and Progress use the same weak-topic helper and SQL history counts. Home
uses all-time history; Progress uses its selected range. Topics below 60% qualify.
Home supplies summary stats and the yearly activity heatmap. Progress focuses on
topic, question-type and directive-verb marks, followed by score history, weak spots
and flashcard mastery. Question weaknesses unlock after 3 marked answers across
2 distinct sessions in the selected range; skipped and unanswered attempts do not
count. Flashcard weaknesses retain their separate review history.

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
