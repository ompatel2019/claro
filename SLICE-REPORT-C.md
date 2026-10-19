# Slice C — Flashcards and Mark my answer

## Scope

Owned flashcards overview, builder and runner; mark form and recent checks; single-session activity result. No shared shell, admin, schema, migration, dependency, font or CSS file changes. Existing non-single redirects and pending/failed/photo/own-question result handling remain in place. Shared annotated-feedback APIs were not changed.

## Changes

- Flashcards: template “Mastered” label, honest due/deck time estimates, due-topic aggregation using real parent relationships, in-page My cards navigation, count styling, Terms as the student-page default, answer-mode icons and compact advanced options in the builder header.
- Runner: template card spacing, no programmatic focus outline around the term, full-width flip action and Skip key badge. Save and exit returns to Flashcards; persistence, rating, speech, test and resume logic remain.
- Mark: template heading copy, compact bank/My own selector (My own remains disabled when its existing feature flag is off), search icon, parent-unit filters, scrolling picker, selected-question summary, answer placeholder and word count, inline submit footer and recent-answer title/date/status hierarchy. Photo handling still composes WrittenAnswer. Existing draft restoration and immutable saved-question rules remain.
- Single result: question H1 and real marked date/topic, report/practise/rewrite actions, 96px score ring, provisional/reviewed badge, verb meaning, matched criteria band, next-mark fixes and rewrite footer, lined-paper answer, examiner legend and numbered anchored notes. Review/dispute action remains accessible under Marking review. Rich question tables and stimuli remain rendered. Existing sample answers and explanations remain available in collapsed sections. Hovering or focusing a note highlights its linked words and margin card.
- Rewrite links preselect the bank question through a query parameter; an explicit rewrite takes precedence over a cached draft.

Changed files: `src/app/(app)/student/{flashcards/page,mark/page,activity/[id]/page}.tsx`, colocated flashcards/activity page tests, `src/components/{flashcard-builder,flashcard-runner,mark-my-answer}.tsx` and their tests, private `src/components/student/mark/{single-result,marked-answer,report-problem}.tsx` and result tests, `e2e/{flashcard-session,mark}.spec.ts`, this report.

## Visual verification

Inspected template HTML and desktop/mobile PNGs. Captured rounds in `/tmp/s2b-C/r1`, `/tmp/s2b-C/r2`, `/tmp/s2b-C/r3`; compared the initial and second-round desktop shots plus mobile result/flashcards template shots, then corrected mobile result height, outline-link borders, header actions, legend visibility, builder layout and mark input hierarchy. Round 3 was intermediate during compilation and is superseded by the final capture.

Final screenshot directory: `/tmp/s2b-C/final` (four routes at 1440 and 390; overview/result refreshed after the final layout changes).

- Flashcards: overview/library/builder/summary/My cards structure follows the template. Real full topic names retained. Extra advanced controls are accessible from the small header ellipsis. Fixture has zero matching term/stat cards, so empty states replace the template’s populated deck and due-review CTA.
- Flashcards session: card widths, typography, field, flip action, key badge and view switch follow template. Fixture is a resumed legacy session with prior reviews, elapsed time and no study/test mode; honest resume notices and its actual content remain. Shared focus header differs (see below).
- Mark: two-column form and mobile stack, selected question, input and recent section follow template. Fixture has four questions rather than twelve and different question lengths, so card heights differ. My own is disabled by the existing feature flag.
- Mark result: template’s result hierarchy, score/criteria/fix cards, question H1, note rail and lined answer reproduced. Fixture has a cash-rate question and three comments rather than the template’s wage-growth question and four comments; copy, answer length and resulting height differ honestly. Review and existing explanation/sample-answer controls add collapsed sections below the template sections.

## Data derivations and omissions

- Topics and dot points come from the topics query, including parent_id; no topic names invented.
- Counts and card states come from loaded cards/progress, existing ownership count and unfinished-session reviews. Due aggregation resolves topic parent_id in addition to the established seeded ID convention.
- Time estimate: round(card count × 0.33), minimum one minute for a non-empty deck; no estimate replaces a zero-due explanatory state.
- Score percentage and “marks from full marks” derive from stored mark/max_marks. Matched criteria uses the stored numeric min/max range, avoiding incompatible band-string formats.
- Notes and fixes come from validated stored comments and next_mark_line/next_band. Invalid anchors are displayed as overall/missing notes rather than marking unrelated words. Provisional means the result has not completed human review.
- The template sample-answer button is omitted: the bank-question loader does not expose sample_answer. No fabricated sample text added.
- No invented “started today” text added to unfinished sessions because the existing loader does not load that timestamp.
- The screenshot mock returns legacy flashcard kinds (`concept`/`definition`) rather than the application’s `term`/`stat`, and its HEAD ownership count differs from the loaded owner rows. Its filters also return MCQs despite the bank loader’s written-only predicate. These fixtures were not modified or masked in production UI.

## Wanted shared changes

Outside this slice: shared AppShell reserves 80px on the desktop right, has different logo/sidebar spacing, no exam countdown, two desktop FABs, and a different mobile toolbar. Its active navigation highlights Activity for a single-result URL instead of Mark my answer. Shared SessionShell has an inline card progress bar, different saved/meta layout and report icon. Integrating the foundation slice should resolve these; no compensating widths or global overrides were introduced here.

## Validation

- Prettier: all changed files checked; green.
- ESLint: all changed TS/TSX/e2e files checked through `Q_MIN_GB=3 q-run`; green, including final private components and route guard.
- Whole-project `Q_MIN_GB=3 q-run npx tsc --noEmit`: green after the final implementation.
- Vitest: 71 unique targeted tests green across flashcard builder (8), runner (31), mark form (21), flashcards page (2), activity detail page (7), and private result (2). Relevant suites were rerun after their final changes. The result tests exercise matched bands, provisional versus reviewed/full marks, invalid anchors, rewrite destinations and focus-linked annotations.
- Logs: `/tmp/s2b-C/{tsc-complete,result-complete,mark-final,builder-final,vitest-final,eslint,eslint-final,eslint-extra,eslint-complete,eslint-route}.log`. The earlier combined vitest log contains an initial new-test environment-mock failure; the final result-complete rerun is green (9 tests including the route tests).
- Screenshot harness: four routes at both widths, exit 0; overview/result refreshed in the final directory after the last layout changes. Final mobile screenshots inspected for stacking, padding, buttons and note placement. Shared header/sidebar differences are documented above.
- E2E selectors updated for intentional visible copy/navigation changes. Authenticated/writing E2E suites were not run because this task permits only the read-only local mock; the screenshot harness supplies the required local Playwright visual verification.
- No production/authenticated network calls or writes were used. The screenshot harness attempted its existing elapsed-time autosave against the read-only local mock, which correctly rejected the mutation.
