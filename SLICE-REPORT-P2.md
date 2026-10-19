# Slice P2 — Progress integration review

Changed files: `src/app/(app)/student/progress/page.tsx` and its test; `src/components/progress-tables.tsx`; `src/components/score-trend.tsx` and its new test; `src/components/student/progress/charts.tsx`; `src/components/student/home/sections.tsx` (target constant substitution only); `src/lib/progress.ts` and its test; `e2e/progress.spec.ts`; this report.

Progress now uses “Against your target”, the existing shared TargetGauge with its coral target tick, the target gap / On target summary, and a history-derived “Since” cell. Home, WeeklyAverageTrend and Progress all use the exported `PRACTICE_TARGET = 80` product default. There is no Edit control because there is no real target-setting action.

The trend now renders WeeklyAverageTrend, with the template subtitle, dashed target and 80% label, smooth shaded curve, endpoint dot / percentage, percentage ticks and date labels ending Now. Progress uses the template's 264px chart height; home's existing default remains 196px. Removed the private gauge and duplicate populated trend renderer. The top-right table toggle, actual weekly data, canonical session report links, and existing kind/type filters remain available; filters are inside the table view to preserve the default template layout. Updated the progress e2e filter navigation accordingly.

Topic parents have visible outlined pill links. Dot points retain compact Sprint text actions and the template's 2.5-unit vertical padding. Numeric headings align with their columns, parent text and header typography follow the template, and mobile topic widths reveal more numeric columns. Mobile cards use 16px gaps, desktop uses 20px; chart actions stay at the top-right of their cards when subtitles wrap. Weak-spot inner cards use the template's rounded-xl shape and visible outline actions.

Questions answered, By question type, By directive verb and Weak spots retain the template hierarchy, copy, meters, coral highlight, bars, footer and locked-session indicators. Actual values and available content remain data driven. The seed has eight policy dot points rather than five, longer topic names, a different Focus unit, four qualifying directive verbs, scored extended responses and different question/card weaknesses; their content and resulting heights intentionally reflect the RPC. Actual last-practised dates remain visible on dot points when available.

Data derivation:

- Gauge: sum parent earned / possible marks, rounded; subtopics are not counted twice. Gap: `max(80 - current, 0)`, with On target at or above 80.
- Since: current aggregate mark percentage minus the first scored week's arithmetic session mean (rounded), only when at least two scored weeks and marked answers exist. Weeks use Sydney calendar days and Monday starts, bounded by the selected range before averaging. Missing/invalid timestamps and non-finite scores are excluded. The fixture shows Since September −7 pts. The cell is omitted when history cannot support it.
- Trend: actual scored finished-session weekly means from existing history, respecting the existing range loader and score filters. No missing weeks or sample chart values are fabricated.
- Weekly question volume sums `activity_days.questions`. Types, directive verbs, topic names, counts, percentages, last-practised dates and weak spots retain existing RPC sources and eligibility rules.
- Retry counts are unavailable: the existing honest “questions answered” copy remains. Card-only weak spots omit question marks and retry actions; absent matching missed-card data omits Review cards. The template's unstarted extended-response callout is only shown as an unstarted action when there are no actual answers.

Visual verification: inspected the prototype and both template images (the mobile template is a 2x capture), and generated desktop/mobile rounds `/tmp/s2b-P2/r1` through `r4` through the required harness on port 3151. Round 1 exposed an unsupported downward icon and was discarded; round 2 desktop rendered correctly but its mobile capture was interrupted by source recompilation and is superseded. Round 3 rendered both widths successfully and informed the final mobile icon, column and gap adjustments. Round 4 verified these changes; round 5 verified fixed mobile column widths and wrapping the data-derived Focus badge with its topic. The final capture adds enough width to keep the Answered and Marks headings separate. Final screenshots: **`/tmp/s2b-P2/final`**.

Wanted shared changes / remaining differences: the shared TargetGauge has 51 ticks and a different SVG viewbox from the prototype's 41-tick gauge. It is used as requested and was not edited outside ownership. Shared shell/font/logo/account/sidebar/countdown differences remain outside this slice. The final data-dependent table and weak-spot differences above cannot be removed without fabricating or hiding real data.

Validation:

- Prettier: changed source, tests, e2e spec and report formatted and checked.
- Changed-file ESLint through `Q_MIN_GB=3 q-run`: passed; the final table-only change was checked again.
- Whole-project `Q_MIN_GB=3 q-run npx tsc --noEmit`: passed. An initial concurrent capture/typecheck encountered disappearing generated `.next/dev/types` files; the later whole-project run passed.
- Queued Vitest: seven files, **63 tests passed** (progress page, private chart, shared trend, topic tables, progress helpers, home sections and home page). After the final table markup change, the page/table suites were rerun: **17 tests passed**. Added coverage for target/On target, first-week change and its omission, selected-range/Sydney-date boundaries, invalid scores, shared target line and real endpoint labels.
- Required read-only screenshot harness captured 1440 and 390 successfully in rounds 3, 4 and 5, plus final. No page errors in these complete rounds. Authenticated writing e2e suites were not run against the read-only fixture; the filter e2e was updated to open the trend table before accessing filters.
- `git diff --check`: passed.

No schema, migration, dependencies, fonts, global CSS or admin pages changed. No production calls, push, PR or merge.
