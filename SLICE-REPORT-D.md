# Slice D — Mark my answer and Progress

## Files changed

- `src/app/(app)/student/mark/page.tsx`
- `src/app/(app)/student/mark/loading.tsx`
- `src/components/mark-my-answer.tsx`
- `src/app/(app)/student/progress/page.tsx`
- `src/app/(app)/student/progress/page.test.tsx`
- `src/components/progress-controls.tsx`
- `src/components/progress-tables.tsx`
- `SLICE-REPORT-D.md`

## Template matching

Read the STEP 1 report, template render functions and installed Next.js server/client component guide. Reused foundation PageHeader, ScoreRing, Meter, cards, controls and portal icons; no shared files or data-layer files changed.

Mark now fills the content width, stacks on mobile/tablet and uses equal question/answer columns at the template's xl breakpoint. The answer card is sticky on wide screens. Card headings have descriptions and compact segmented controls. Question filters, bordered question options, selection dots, scrolling bank, answer context, textarea sizing and embedded submission footer follow the template. Recent marks use a full-width card with activity link, leading icons and truncated titles. Loading follows the same column structure.

Progress uses the template header and range-control width, puts the existing session score history at the top alongside an honest mark summary, then topic marks, question-type/verb breakdowns and weak-spot cards. Topic marks scroll horizontally on narrow screens, retaining all columns, sorting, expandable nested tables and practice routes. Meters replace coloured score badges. Question types use vertically stacked meters. Weak spots use responsive bordered/dashed cards and real topic/session meters. Flashcard mastery, retries, empty states and all score-history filters/links remain available.

All server loaders, actions, auth checks, polling, photo processing, submission, draft restoration, feature flags, routes, query parameters and component exports are preserved. Existing tested accessible names are retained, including the longer names on the compact question-source segments.

## Data-dependent omissions and retained differences

- No target preference exists in ProgressData: omitted the target gauge, target editing, target dashed line and claimed improvement. A ScoreRing instead shows summed earned/possible marks from parent topics only, preventing double counting; omitted when no marks exist.
- Retained individual-session score history rather than labelling it a weekly average. No question-volume-by-week series exists in this contract, so no invented volume chart was added.
- No sample answer exists in the bank-question contract; omitted the sample-answer action.
- Did not preselect a question or add example recent marks. Existing search selection/closing behaviour, feature-gated own questions, daily quota and WrittenAnswer word guidance are preserved.
- No focus-topic flag exists, so no template Focus badge was invented. Existing verb sorting and answered-count columns remain, rather than replacing them with a static ranked list.
- Weak-question and missed-card rows retain their existing separate actions and eligibility rules. No combined retry/card counts or fabricated last-practised dates were added.

## Mark-result ownership limitation / requested integration

The actual result URL remains `/student/activity/[id]`; there is no result page under the owned `/student/mark/**` tree. Its composition is in `src/app/(app)/student/activity/[id]/page.tsx`, which is outside this slice's ownership. This slice does not claim to have restyled that result view and did not add an unused private wrapper or a new route.

Wanted changes for the owning slice:

- `src/app/(app)/student/activity/[id]/page.tsx`: compose the single-answer result header with the real question stem, back link and existing report/practice/rewrite actions; place score summary, criteria and next-step cards in the template's responsive three-column result grid. Keep the existing marking, photo and guideline fallbacks.
- `src/components/results-report.tsx` and `src/components/annotated-feedback.tsx` (slice B): render available criteria/next steps and marked answer annotations inside template cards, with stacked mobile notes and desktop side notes. Only render evidence/verb guidance present in actual feedback data.
- `src/components/written-answer.tsx` (slice B): optionally provide a presentation-only way to hide its duplicate input label and supply the template placeholder in Mark's already labelled card, retaining the accessible name, word guidance and upload/transcript behaviour.
- `src/components/data-table.tsx` / `src/components/ui/table.tsx`: a future opt-in borderless card-embedded presentation would remove nested table borders without affecting admin tables. Current slice composes the existing table, retaining sorting and nested-table accessibility.

## Validation

Heavy checks used `Q_MIN_GB=3 q-run`. No dev server, Next build, Playwright, production services, environment files or database changes.

- Prettier write and check on all changed source files: PASS.
- ESLint on all changed source/test files: PASS.
- Whole-project `tsc --noEmit`: PASS.
- Relevant Vitest suites: PASS — 5 suites, 40 tests. Includes MarkMyAnswer, progress controls/tables/page and activity detail, covering direct imports of changed components.
- Updated the meaningful heading-order assertion and added weighted parent-topic summary coverage.
- Initial test run found the old heading-order assertion and missing `NEXT_PUBLIC_APP_URL`; updated the assertion and reran with synthetic `http://localhost:3000`. No production credentials loaded.
- `git diff --check`: PASS.
- Browser screenshots at 390/768/1024/1440 were not captured, per the explicit prohibition on dev servers and Playwright. Responsive behaviour is implemented through the template breakpoint classes; visual equivalence remains unverified in a browser.
