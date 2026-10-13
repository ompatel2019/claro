# Review round 1: lane 4

- Flashcards: deck size and answer method follow Mode; Study supports drafts before self-rating. Existing list/repeat behaviour remains.
- Questions: imports create drafts offline. The app edits existing rows only; Topic and Subtopic are dependent selectors in the editor, bulk move and list/import filters.

Apply migration 0042 before serving these changes. Use Node 22 and export local/test variables. Run checks and Playwright through `Q_MIN_GB=3 Q_SLOTS=1 q-run` with one browser worker.

- Disputes: `request_mark_review` locks the student profile and changes review/attempt state atomically. `admin_dispute_history` aggregates all-time counts in SQL. Unchanged/lowered resolved marks count as rejections; limits are five per Sydney week, three open, one per answer, and a 48-hour rejection cooldown. Apply migration 0043 before serving this flow.

- Spend: bad costs become zero in totals; non-finite averages are hidden. `ai_usage.attempt_id` links individual mark/transcribe/retry calls through an async context. Buckets use stored maximum marks and distinct tracked marked answers. Historical/batch costs remain unallocated because the engine is outside this lane’s scope. Apply migration 0044 before deploying.

# Portal behaviour

Home supplies summary stats and the yearly activity heatmap. Progress focuses on
topic, question-type and directive-verb marks, then weak spots, score history and
flashcard mastery. Question weaknesses below 60% unlock after 3 marked answers
across 2 distinct sessions in the selected range; skipped and unanswered attempts
do not count. Flashcard weaknesses retain their separate review history.

Migration 0039 adds session counts to `student_progress`, counting parent sessions
only once across subtopics, and removes the unused overview stats query.
Validation covers threshold logic, breakdown order, range filters, load errors,
retry behaviour and mobile/desktop tables in the Progress unit tests,
`e2e/progress.spec.ts` and transactional `supabase/tests/weak-topic-samples.sql`.
Run checks and browsers serially through `Q_MIN_GB=3 Q_SLOTS=1 q-run`.
