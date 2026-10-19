# Slice B — Sprint setup, session and results

## Files changed

- `src/app/(app)/student/sprint/page.tsx`
- `src/app/(app)/student/sprint/[id]/results/page.tsx`
- `src/components/sprint-setup.tsx` and its colocated test
- `src/components/sprint-runner.tsx` and its colocated test
- `src/components/session-shell.tsx` and its colocated test
- `src/components/booklet-controls.tsx`
- `src/components/finish-sprint.tsx` and its colocated test
- `src/components/written-answer.tsx`
- `src/components/question-view.tsx` and its colocated test
- `src/components/results-report.tsx` and its colocated test
- `src/components/results-browser.tsx` and its colocated test
- `src/components/annotated-feedback.tsx` and its colocated test
- `src/components/student/sprint/result-stat.tsx` (private metric composition)
- `SLICE-REPORT-B.md`

## Template alignment

Read the STEP 1 report, the prototype builder/session/results renderers, and the installed Next.js client-component guide. Reused the foundation page header, controls/chips, badges, meters, score ring, delta pills, examiner pen marks, existing icons and UI primitives. No shared foundation, global CSS, dependency, data-layer or out-of-scope files changed.

- Setup: replaced the wizard with one page; divided builder card, question-type option cards, topic cards with dot-point chips, size controls, paper years, visible history preference, compact timer/feedback controls and a live summary. Summary sits beside the builder at desktop widths and below it on smaller screens. Existing additional filters remain under Advanced and custom pacing under Adjust exam pace.
- Setup shortcuts: presented the existing real MC and short-answer quick-start configurations as template-style cards; retained their server action, config payloads and accessible names.
- Session: 68px focus bar with grouped title/metadata, outlined timer, 272px booklet rail, centered 760px question surface, larger question typography, option letter tiles, divided answer-action footer, navigation arrows and mobile question position. Preserved the mobile tools menu, keyboard shortcuts, saving, marking, overtime, flagging, checking and finish flows.
- Results: activity link and dated heading, score ring and historical delta pills, responsive metric grid, next-step and strengths/fixes panels, grouped answer tiles with a key and short-answer marks, retained table review and hash/keyboard navigation.
- Written review: ruled answer booklet, foundation examiner underlines and pen symbols, neutral margin-note cards, and margin notes at container widths that fit the desktop results surface. Kept selection anchors, filtering, comment editing, photos, dispute controls and read-only behavior.

Shared exports retain their props and behavior for flashcard and admin consumers. All loaders, auth checks, server actions, network endpoints, routes, query parameters and existing accessibility labels remain intact. The removed wizard step gate is replaced by the same size, pace, pool and pending validation on the one-page form.

## Real-data differences and omissions

- No fabricated fiscal-policy weak-spot or “same as last time” shortcut. The setup loader supplies topics and an unfinished session, not the prototype's staged weak spot or a previous finished setup. The existing real short-answer quick start accompanies Section I instead.
- No Discard action: the existing unfinished-session contract offers Continue/View results and Finish and mark.
- Kept real defaults, preset sizes, topic limit (two), pool counts and available year range. They can differ from the screenshot's staged 25-mark, two-dot-point, 2011–2026 example.
- The setup summary does not estimate a written-question count from a marks target: the pool has not selected the actual questions yet. It reports the real target in marks or questions.
- Historical comparisons appear only when an actual prior average exists. Retained the actual written percentage metric rather than replacing it with the prototype's staged 5/12.
- Stored feedback, deterministic next-action links and marking/review status remain visible; no staged retry duration, invented topic performance cards, strengths or fixes were introduced.
- No browser screenshot or viewport assertion was run: dev servers, builds and Playwright were explicitly prohibited. Responsive layouts were reviewed in the markup against the supplied reference views.

## Wanted shared-component changes

None required. Foundation components were composed without changing their APIs or styles.

## Validation

All heavy commands used `Q_MIN_GB=3 q-run`. Checks used synthetic CI public environment values, without reading environment files or using production services.

- `npm run check`: PASS — whole-project Prettier, ESLint, `tsc --noEmit` and Vitest; 180 test files / 1,859 tests.
- Colocated behavioral coverage adapted for the one-page builder, badge markup and neutral examiner notes; added coverage for selecting a dot point with its parent, enforcing the two-topic limit and clearing both selections.
- Whole-project Vitest includes every test importing changed components, plus flashcard and admin compatibility coverage. Import searches included setup, runner, session shell, booklet controls, finish sprint, written answer, question view, results browser/report and annotated feedback.
- `git diff --check`: PASS.
- No build, dev server, Playwright, push, PR or merge.
