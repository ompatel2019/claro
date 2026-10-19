# Slice A — Activity and Progress

## Changed files

- Activity page, browser, filter controls and session table; browser tests.
- Progress page and page tests; progress controls; topic/verb tables and tests.
- Private `src/components/student/progress/charts.tsx` and chart tests.
- Activity, progress and weak-topic e2e specs; localized activity/progress additions in `pages.offline.spec.ts`.

## Visual verification

Captured both routes at 1440 and 390 with the supplied read-only harness in `/tmp/s2b-A/r1`, `/tmp/s2b-A/r2`, `/tmp/s2b-A/r3`. Round 1 exposed excess card padding and a mobile overflow. Round 2 corrected the card spacing; the new offline regression traced remaining overflow to an absolutely positioned screen-reader table label. Giving the table scroller a positioning context fixes it. Round 3 confirms the mobile image is exactly 390 pixels wide and the chart labels remain readable after resizing.

Final screenshot directory: `/tmp/s2b-A/r4`.

### Activity

Matches the header/copy/Start sprint hierarchy, two-column unfinished cards with mobile stacking, segmented tabs and counts, search above the filter strip, five data columns, date groups, icon chips, title/subtitle hierarchy, dark result meters, provisional/in-progress/draft states, duration, local time, resume/report links, and 12-row footer with Load more. Load more reveals already loaded rows and appends subsequent server pages without dropping visible history. Sorting/filter URLs and custom date controls remain available.

Remaining differences: fixture sessions/numbers/dates deliberately differ from the template. Completed Study rows without review records display a dash. No Discard control: there is no existing authorized discard action to wire up. No invented Not marked state. Flashcard session labels follow their saved mode rather than claiming Due for review for topic decks. Shared shell differences are listed below.

### Progress

Matches the summary/trend card proportions, semicircle gauge, smooth shaded weekly chart with endpoint, expandable four-unit topic table, aligned dot-point rows, weakest-unit Focus badge and coral meter, weekly volume bars with the newest week coral, question-type meters and unstarted actions, ranked directive-verb bars, footnote, and unlocked/locked weak-spot cards. The final parent unit starts expanded like the template; every real dot point remains available, so table height varies with seed data. Charts have data-table toggles and history report links; history kind/type filters remain in a collapsed disclosure.

Remaining differences: no persisted student target exists, so the summary is called Practice average and displays actual marks/answers rather than a fabricated target, edit control, gap, or dashed target line. The template's Since August delta is omitted because the selected range can exclude August and there is no stored August baseline. The real seed has more dot points and some longer names than the demo, and the fixture has scored extended responses rather than an unstarted type. Flashcard mastery is not a separate card in the template layout; card weaknesses remain available through Weak spots.

## Data derivation

- Names and parent relationships come from `topics` and `student_progress`; no UI topic labels or example figures are fabricated.
- Activity titles use existing `sessionTitle` with the real saved session config and topic names. Parent topic cells resolve selected dot points back to their real parent unit. Marks use session score/max_score; percentages and counts retain the existing activity RPC.
- Unfinished cards query only the signed-in student's unfinished student sessions. Review counts use distinct reviewed card IDs; absent review data is not inferred from the question-answer count. Study results use each card's latest recorded rating and count mark=1 as knew. Without review records, no knew count is shown.
- Topic totals sum parents only; the gauge is earned/possible, avoiding double counting dot points. Focus is the lowest eligible parent percentage.
- Trend points are arithmetic means of finished, scored sessions grouped by Sydney Monday week. Missing weeks are not filled with invented results. Volume sums actual `activity_days.questions` by Monday week and filters to the chosen date range. Card activity is excluded from the questions chart.
- Weak spots retain existing sample-size/session eligibility helpers and canonical sprint/flashcard setup URLs. Locked session meters use actual sessions. Questions answered is not mislabeled as retryable mistakes; the RPC does not expose mistake counts per topic.

## Wanted shared changes

AppShell/logo/topbar/sidebar/FABs are outside ownership: template logo treatment, mobile header/menu, desktop content width/right padding, sidebar countdown and duplicate feedback/Ask floating buttons need the shell slice. No shared CSS/font/token changes were made. The private weekly chart can be unified with slice H's score-trend chart after integration; `src/components/score-trend.tsx` was not edited.

## Validation

- Prettier on all changed source, tests and specs.
- Changed-file ESLint through `Q_MIN_GB=3 q-run`: green (final rerun recorded below).
- Whole-project TypeScript through the queue: green (final rerun recorded below).
- Focused Vitest suites cover progress page/controls/tables, activity browser and private charts; final result recorded below.
- Offline Playwright (`e2e/pages.config.ts`, no application server) covers activity report navigation and mobile progress containment; 2 tests green.
- One initial Playwright invocation accidentally used the default server config and failed on port/env setup; corrected to the existing offline config. No live authenticated e2e, production calls, schema changes, push, PR or merge.

Final results: changed-file ESLint passed; whole-project `tsc --noEmit` passed; 5 focused Vitest files / 39 tests passed; 2 offline browser tests passed. All four final images in `/tmp/s2b-A/r4` inspected; both mobile captures are 390 pixels wide. No browser hydration errors in the final capture log.
