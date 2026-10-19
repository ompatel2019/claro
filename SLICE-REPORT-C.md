# Slice C — Flashcards

## Files changed

- `src/app/(app)/student/flashcards/page.tsx`
- `src/app/(app)/student/flashcards/page.test.tsx` (new)
- `src/app/(app)/student/flashcards/mine/page.tsx`
- `src/app/(focus)/student/flashcards/[id]/page.tsx`
- `src/components/flashcard-builder.tsx`
- `src/components/flashcard-builder.test.tsx`
- `src/components/flashcard-runner.tsx`
- `src/components/flashcard-start.tsx`
- `src/components/my-cards.tsx`
- `src/components/my-cards.test.tsx`
- `src/components/card-editor.tsx`
- `src/components/student/flashcards/new-card.tsx` (new)
- `SLICE-REPORT-C.md`

## Template match

Used the supplied HTML's FlashcardsPage, DueCard, DeckStatsCard, DeckBuilderCard, DeckSummaryCard, FlashcardSessionPage, FlipCard and new-card dialog as the reference, alongside the four supplied screenshots and the STEP 1 report. Read the installed Next.js page and client-boundary guides.

- Full-width page header and actions; due review and library panels; two-thirds builder and one-third sticky summary at `xl` (1440px); single-column panel order at 390/768/1024px. Builder rows switch from stacked controls to label/control columns at `sm`.
- Due count, estimated minutes, topic meters, unfinished-session banner and Continue action. Library distribution, percentages and Terms/Stats/Yours totals use the existing bank and progress.
- Compact segments, outlined choice chips, topic chips, live deck summary, Start deck and Reset. Existing subtopic filters, Which cards, Order and Repeat missed cards remain under an accessible native “More deck options” disclosure.
- Personal-card section with the template empty state and working creation buttons. Existing My cards route, filter/query parameters, pagination, bulk actions, import/export, deletion/undo and selection-based deck creation remain available.
- Focus session has a 680px content width, view segments, badges and position, 30px question heading, answer placeholder, speech action, full-width flip button and compact skip action. Answer/rating/verdict states retain their existing controls. Completed sessions retain their detailed results, with the template's Deck done treatment above the existing metrics and actions.
- Editor uses template copy, field spacing and placeholders, keeping Kind, subtopic selection, existing accessible labels and Save and add another.
- Reused foundation page header, empty state, meter, stats, controls, cards, badges, icons and inputs. No new CSS, dependencies, fonts, image assets or raw hex colours.

## Data and behaviour notes / deliberate differences

- Server loaders, Supabase queries, authentication, actions, session persistence, review queues, keyboard shortcuts, speech handling and component prop contracts were preserved. FlashcardStart keeps its API for the home page. CardImportDialog is unchanged, including its admin API.
- All counts are derived from existing loaded records. Estimated minutes are explicitly approximate, using the template's roughly three cards per minute.
- No session start timestamp is loaded by the existing query, so the template's “started today” is omitted.
- “Mastered” is shown as “Known,” matching the app's actual concept: reviewed with latest mark 1. Learning means reviewed with latest mark below 1; New means never reviewed. No unsupported mastery threshold is introduced.
- When personal cards exist, the main page shows their actual count and a Manage my cards link. The existing main-page loader supplies only their count, so no card fronts or examples are invented. The real list remains at `/student/flashcards/mine`.
- The My cards header link retains its existing route instead of becoming the template's scroll-only action. The section still has `id="my-cards"`.
- Default card types, disabled choices, speech capability messages and configuration restoration follow the existing app, even where the template demo chooses different settings.
- List view continues to expose the existing answer table rather than adopting the prototype's per-row reveal interaction. Finish, exit and result actions keep their existing behaviour. The shared session shell is used as-is.

## Wanted shared-component changes

None required. No shared components, data-layer files, styles, layouts, admin files or dependencies were edited. Session-specific width and spacing are composed within the owned runner.

## Validation

All heavy checks ran through `Q_MIN_GB=3 q-run`.

- Prettier write and check on every changed TS/TSX file: PASS.
- ESLint on every changed TS/TSX file: PASS.
- Whole-project `npx tsc --noEmit`: PASS.
- Vitest: PASS — 5 files, 57 tests:
  - `src/components/flashcard-builder.test.tsx`
  - `src/components/flashcard-runner.test.tsx`
  - `src/components/my-cards.test.tsx` (also covers CardEditor, CardImportDialog and the new creation entry point)
  - `src/app/(app)/student/flashcards/page.test.tsx`
  - `src/app/(app)/student/quick-start.test.tsx` (home-page FlashcardStart consumer)
- New coverage verifies honest empty library data, derived distribution/topic counts, exclusion of stale progress, deduplicated unfinished reviews, creation through the real editor, live summary changes and reset persistence. Existing behavioural tests remain intact; layout assertions were adapted to the template's desktop sticky summary.
- `git diff --check`: PASS.

No dev server, build, Playwright, production service calls, environment files or database changes. Browser screenshot comparison was not run, as instructed; responsive matching was checked against the reference markup and supplied screenshots.
