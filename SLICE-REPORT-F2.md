# Slice F2 — Focus sessions and mark-result navigation

## Files changed

- `src/components/session-shell.tsx` and its test: flashcard-specific header spacing, full Save and exit label at both widths, visible/truncated session title, a single Card / Knew / check-Saved metadata line, accessible progress with no visible inline bar, desktop flag feedback icon, collapsed mobile tools, and template content padding. Sprint header/tool behavior remains unchanged.
- `src/components/flashcard-runner.tsx` and its test: template view-switch height, removed extra wrapper padding, resume/recycle announcements remain screen-reader accessible without adding visible rows, and the typing/flip hint also appears for legacy sessions without a mode. A keyboard test now waits for the preceding async skip to finish.
- `src/components/claro/active-nav.tsx`, `src/components/app-shell.tsx` and its test: minimal typed client context scopes the Mark my answer override to the mounted single-session route. The original activeItem function/default behavior and administrator navigation remain unchanged. Overrides clear on unmount and cannot bleed into another pathname.
- `src/app/(app)/student/activity/[id]/page.tsx`: registers Mark my answer for all single-session states, including unfinished checks and fallback result presentations. Existing loaders, redirects and authorization are preserved.
- `src/components/student/mark/single-result.tsx` and its test: explanation, sample answer, review status and Question this mark remain available inside one subtle More disclosure within Your answer, marked. No disclosures follow the final card.
- `e2e/flashcard-session.spec.ts`: checks attachment of the now screen-reader-only resume announcement.

## Visual verification

Used the required local mock and screenshot harness on port 3152; two complete rounds, each capturing flashcards-session, sprint-session and mark-result at 1440 and 390:

- Round 1: `/tmp/s2b-F2/r1`. Inspected desktop/mobile flashcards, mobile sprint and desktop result; corrected the 4px view-switch/card offset and mobile header crowding.
- Final round: `/tmp/s2b-F2/r2`. Inspected desktop/mobile flashcards and mobile result against the template, plus the sprint captures for consistency.

Per-route notes:

- Flashcards: desktop card starts at x380/y170 and is 680px wide, matching the template; mobile starts at x16/y154 with the same chip/title/answer/speech/flip/skip hierarchy. Header has full Save and exit, title, one truncated metadata line, timer and Finish. Desktop has a flag/report control; the mobile tools collapse as in the reference. Speak + “or type, then flip” is present. No visible welcome/recycle rows or inline progress bar remain.
- Sprint: retained existing focus-shell implementation, header tools and mobile tools menu; no sprint layout changes. Data-dependent question length and existing Seen before state differ from the template fixture.
- Mark result: Mark my answer is active, Activity is inactive. The page ends at Your answer, marked, with its single More row preserving additional functionality. Existing three-column desktop and stacked mobile result layout is retained.

Remaining differences are real-data content and the established final font metrics/shared control metrics: the mock has Inflation, 8 flashcards, 5 known and about seven minutes elapsed, versus the template's Economic growth, 20, 0 and one second; its demand-pull card differs from the growth card. The result has a cash-rate question, shorter answer and three comments rather than four. Counts, labels, dates, personal details, heights caused by text wrapping and elapsed time were not fabricated to reproduce a frozen fixture. More adds a small row inside the final card to keep existing features reachable, as explicitly permitted by the brief.

## Data and ownership

No new data derivations, fabricated values, schema changes, dependencies, fonts, CSS files, auth changes or production network calls. Session title, position, total, known count, save status, timer, cards, topics and result content continue to use existing state/loaders. Resume/recycle information remains available to assistive technology. No requested functionality was omitted. The product target constant belongs to the progress/home owners and was not changed in this slice.

Wanted shared changes: none needed for this scope. Shared FocusBar's injected mobile feedback button is hidden only within the flashcard header to match the supplied mobile reference; desktop feedback remains available. The shared component itself was not edited.

## Validation

- Prettier applied to every changed TS/TSX file and this report.
- Queued ESLint on all changed TS/TSX/e2e files: passed.
- Queued whole-project `tsc --noEmit`: passed after correcting a test-only Testing Library option.
- Queued Vitest: 7 files / 73 tests passed (session shell, flashcard runner, AppShell, single result, activity detail page, question mark, kit). AppShell's 3 tests additionally rerun and passed, covering default navigation and override route/unmount lifecycle.
- New result regression verifies explanation and marking review are inside the final card and Question this mark is visible when expanded. Existing question-mark submission/validation tests pass. `dispute-guardrails.spec.ts` is preserved; its authenticated database-writing suite was not run against the read-only mock.
- Two screenshot harness runs: passed, six PNGs per round. No separate dev server/build/Playwright commands used.
- `git diff --check`: passed. No push, PR or merge.

Final screenshots: `/tmp/s2b-F2/r2`.
