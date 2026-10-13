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
