# Slice B — Topic Sprint

## Changes

- Setup: template section hierarchy, aligned option cards, compact size presets and Custom controls, selected/total dot-point counters, compact count chips, clear action, paper-year row, timer/feedback cards, summary badges and CTA. Advanced filters remain available with Custom or when filters are active. Selecting the last dot point off also clears its parent.
- Setup server loader: real progress identifies the weakest available topic; the previous finished sprint supplies “Same as last time”. That action submits the original session config. Legacy configs without a target omit the marks label.
- Session: sprint-local focus shell matches template title/metadata, timer, tools, booklet count, question width, question metadata, answer options, footer and navigation. Existing save/exit, countdown warnings, calculator, mobile tools/booklet sheet, keyboard navigation, finish confirmation and marking stay connected. Reused question view has an optional metadata flag, defaulting to the old behavior for admin callers.
- Results: actions below the title; score ring and score/time/MC/written stat cards; actual marks in the written stat; MC retry panel and weakest-topic recovery cards; strengths/fixes; review/table toggle; grouped colored answer chips; compact question metadata. Existing annotated feedback, reporting, mark review and pending/failed marking states remain connected.
- Updated sprint setup/runner/browser/recovery tests and sprint e2e selectors for the single-page builder and new focus metadata. Added coverage for focus-shell recovery, timer hiding and keyboard handling.

## Files

Owned sprint setup/results route pages; sprint-setup, sprint-runner, results-report, results-browser, question-view and booklet-controls components; their relevant tests; private `src/components/student/sprint/focus-shell.tsx`, its test, and `results-next-step.tsx`; `e2e/sprint-setup.spec.ts` and `e2e/sprint-results.spec.ts`.

## Per-route visual review

Compared template screenshots/prototype and all three routes at 1440 and 390 in rounds `/tmp/s2b-B/r1`, `/tmp/s2b-B/r2`, `/tmp/s2b-B/r3`, and final `/tmp/s2b-B/final`.

- Setup: hierarchy, section framing, three quick starts when data supports them, option layout, topic chips/counters, presets, years/timer/feedback and summary rail/stack match the template structure. The real seed has longer names and more policy dot points than the template; these remain verbatim. Initial selection remains the existing remembered/default config, rather than forcing the template’s two sample dot points.
- Session: focus bar, 272px booklet, centered 760px question card, answer-option padding/spacing, footer and navigation follow the prototype. The mock session has four already-marked questions and a different timer/topic; disabled controls, feedback colors and seen-before badges reflect that data. Mobile booklet/calculator remain available in a tools menu.
- Results: template card grouping, action order, metric hierarchy, recovery panels, answer strip and question review hierarchy are implemented. Fixture has four answers, a different score and one topic; no second topic recovery card or sample annotations are fabricated. Actual stored annotated feedback continues to render when present.

## Data derivation / omissions

- Topic/dot-point names: `topics` table. Weak spot: lowest non-null percentage with answered > 0 in `student_progress`. Previous setup: latest finished sprint.
- Setup availability/new counts and year range: existing `sprint_pool` RPC. The read-only screenshot fixture returns an older array shape for this RPC and browser requests fail; captures honestly show count failure and unavailable year controls. No mock/schema/production changes were made and no pool values were invented.
- Time estimates: existing `estimateMinutes` rule (one minute per MC question; 1.5 minutes per written mark unless user changes pace). Retry estimate: 1.25 minutes per missed MC question, rounded up.
- Topic recovery percentages, lost marks and question references: scored session-review rows, grouped by real topic ID. Card links require real matching flashcards. Historical delta pills use existing session/type averages.
- Written question counts are omitted from setup because an exact selection is not available before the server builds the sprint.
- “Discard” is omitted: there is no owned discard action. Existing Continue/View results and Finish and mark retain the actual recovery behavior.

## Wanted shared changes / remaining differences

Shared AppShell/sidebar/topbar/FABs, logo, fonts and global tokens were not edited. Captures still differ in logo treatment, account data, sidebar countdown, mobile navigation, duplicate desktop feedback/Ask FABs, available content width and some global typography/radii. These belong to the shell slice. Stored annotated-answer markup belongs to the existing shared feedback component; the template’s sample essay and comment text are not inserted.

## Validation

- Prettier on changed source/spec/test files.
- Changed-file ESLint and whole-project TypeScript through `Q_MIN_GB=3 q-run`.
- Relevant component tests, including the question-editor importer and activity result page importer, through the queue with local mock public environment values.
- Read-only screenshot harness used for all visual captures; no live authenticated e2e, production calls, standalone dev servers, builds, DB/schema edits, push, PR or merge.

Final results:

- Prettier check: passed for all changed source/spec/test files and this report.
- Changed-file ESLint: passed (`/tmp/s2b-B/eslint-final.log`, `eslint-last.log`, `eslint-compat.log`).
- Whole-project TypeScript: passed (`/tmp/s2b-B/tsc-complete.log`; final repeat in `tsc-last.log`).
- Vitest: **11 files, 106 tests passed**, including setup/runner, focus shell, results/browser, question view/editor, MC explanations, recovery/marking and the activity result importer (`/tmp/s2b-B/tests-green.log`).
- Final screenshot harness: six captures completed without page errors; final directory **`/tmp/s2b-B/final`**. Earlier comparison rounds: `/tmp/s2b-B/r1`, `/tmp/s2b-B/r2`, `/tmp/s2b-B/r3`.
- `git diff --check`: clean.
