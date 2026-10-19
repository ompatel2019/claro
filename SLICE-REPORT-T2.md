# T2 — Topic Sprint integration review

## Files changed

- `src/components/sprint-setup.tsx` and its test: pool summary, year separator, unit checkbox states and UUID selection cleanup.
- `src/app/(app)/student/sprint/[id]/results/page.tsx`: results action icon, header link layout and responsive metrics grid.
- `src/components/student/sprint/result-stat.tsx`: compact mobile metrics and score spacing.
- `src/components/student/sprint/results-next-step.tsx`: singular/plural retry copy and template icon container.
- `src/components/results-report.tsx`: written-score badge, unanswered chip state and strengths/fixes heading icons.
- `src/components/results-browser.tsx`: Review/Table icons and template incorrect-answer palette.
- `src/components/sprint-runner.tsx`: dark answered booklet chips, red flag dots and keyboard hint keycaps.

## Visual verification

Opened the HTML prototype and template PNGs at 1440 and 390. Captured all three routes at both widths in `/tmp/s2b-T2/r1`, `/tmp/s2b-T2/r2`, and `/tmp/s2b-T2/final`. Inspected both comparison rounds and final captures. First-round desktop captures preceded edits; its mobile captures included the first corrections as the dev server recompiled.

### Setup

Unit cards retain checkbox/header/count hierarchy and outlined dot-point chips, with real RPC question counts now visible. Selected chips retain the existing dark fill and pale count. Whole-unit selection now shows a tick and partial selection a minus. Deselecting a unit clears its actual children using `parent_id`, including UUID topic IDs; the old prefix test left stale selections. The summary uses the template's left/right matching/new count layout, bold matching count, “new to you” copy and thin meter. Paper years now include “to”. Quick starts, unfinished banner, summary rows, badges, Start and Reset retain their working actions.

Remaining data differences: defaults are the real remembered/URL configuration, rather than the template's staged mixed sprint. Actual seed names are longer and include eight policy dot points, causing additional wrapping. The mock returns 12 matching questions but 121 new questions; values are displayed as returned, and the existing meter bounds the percentage. Its 12-question shortfall correctly produces the available-question CTA and warning. Years are 2011–2025, as returned. Continue remains in place of Discard because no discard action exists in the owned code.

### Results

Metrics now use the template's compact mobile heights and score spacing. The retry banner handles one missed question correctly. Target, strengths, fixes, Review and Table icons match the prototype; incorrect chips use the brand tint, and genuine “No answer” results use the dashed blank state instead of the incorrect tint. Written results have the compact earned/possible badge alongside their question metadata. Topic recovery cards, meter, percent and actual Practise/Review cards links remain connected.

Remaining data differences: the fixture is an untimed four-answer Inflation result with one recovery topic. Its title, date, score, durations, deltas, feedback and question counts remain data-driven. It contains `answer`/`response` strings but no `answer_text`/`transcript` or annotation comments for sprint reviews. The existing typed review contract therefore cannot render the template's annotated essay or margin notes in these captures. No sample answer or examiner comments were fabricated. Existing annotated feedback, marking guidelines, pending/failed marking, question-mark review and problem reporting remain available.

### Session

The template's 272px booklet, 760px question card, footer divider and navigation remain aligned. Removed results score colours from booklet chips: answered is dark, current has the red ring, and flagged has a small red dot. Footer shortcuts now use the shared keycaps. The fixture's marked attempts have no saved answer fields, so they correctly appear unanswered; the current question remains ringed. Fixture question/topic, total count, seen-before badge, timer and disabled marked-answer controls differ from the template's fresh editable session.

## Data and omissions

- Names and parent relationships come from `topics`; question counts, matching/new totals and year bounds come from `sprint_pool`.
- Setup numbers and minutes retain the existing config and `estimateMinutes` rules. No exact written question count is invented before server selection.
- Results scores, recovery percentages, dropped marks, question references and feedback come from session-review rows. Historical deltas retain the existing session/type averages. Retry duration retains the existing rounded-up 1.25 minutes per missed MC question rule.
- No DB, schema, fixture, auth, loader, shared style, dependency, font or logo changes.
- The practice-target constant is outside this slice and is not used by these sprint routes; no duplicate target constant was introduced.

## Wanted shared changes

Shared shell dimensions, account data, countdown, fonts and mobile header belong to other slices and were left alone. For annotated sprint screenshots, the shared read-only fixture needs real-contract `answer_text`/`transcript` and comments. A future shared `AnnotatedFeedback` presentation option could remove its duplicate large score panel when the compact sprint metadata badge is shown, while retaining the existing admin behavior.

## Validation

- Prettier: all changed source/test files and this report.
- Changed-file ESLint through `Q_MIN_GB=3 q-run`: passed; log `/tmp/s2b-T2/eslint.log`.
- Whole-project `Q_MIN_GB=3 q-run npx tsc --noEmit`: passed.
- Relevant Vitest through the queue: 6 files, 79 tests passed; log `/tmp/s2b-T2/tests.log`. Covers setup, runner, finish, results browser/report and the activity result importer. Added a UUID selection regression test.
- Final screenshot harness: six captures, no page errors, `/tmp/s2b-T2/final`.
- `git diff --check`: clean.

No push, PR or merge.
