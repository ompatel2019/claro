# Slice S — shell and kit

## Changes

- `src/components/app-shell.tsx`: template wordmark composed from existing approved assets; sidebar groups, icons, spacing, tinted active pill and red edge marker; real due badge; Economics display with chevrons; exam countdown above the user row; working user/account menus with Profile, Feedback, theme and Sign out; corrected topbar/mobile spacing; one student Ask Claro FAB; removed desktop right gutter. Admin navigation/API remain compatible, with no student countdown or Ask Claro.
- `src/app/(app)/layout.tsx`: derive exam days on the server and disable the old floating Feedback trigger. Existing feedback provider, submission flow and auth remain intact.
- `src/components/ui/sidebar.tsx`: hamburger on mobile, desktop panel icon, visible sheet close control, and close the mobile sheet after navigation.
- `src/components/claro/layout.tsx`: prototype PageHeader typography/spacing, topbar gap, subject chevrons, countdown radius, and compose the mobile feedback control into FocusBar before Finish.
- `src/components/claro/shell-s/focus-feedback.tsx`: fill the mobile flashcard feedback gap. Hidden on desktop and where the focus bar already has a mobile tools menu; uses the existing feedback provider. No extra FAB.
- `src/components/feedback-widget.tsx`: defer the Supabase client import until submission, keeping shared layout imports independent of client environment parsing. Existing dialog tests still exercise submission and retry.
- `src/components/claro/command-palette.tsx`: desktop search pill and shortcut chips, compact mobile search icon.
- `src/components/claro/kit.tsx`: template section order and descriptions, live CSS token values/notes, chart colour ramp, type hierarchy, button/icon examples, title-case badges, form sizing, data-display layout, pen examples and layout rules. Removed the extra Shell details section. Theme-aware token values update when the theme changes.
- `src/components/app-shell.test.tsx`, `src/components/kit.test.tsx`: compatible mocks and regression coverage for exam visibility, student/admin chrome, one Ask Claro trigger, and feedback from both account menus.
- `e2e/feedback.spec.ts`, `e2e/foundation.offline.spec.ts`: moved general-feedback selector to the account menu; updated offline shell mock.

## Visual verification

Five screenshot rounds with the required shared mock/harness, at 1440 and 390:

- `/tmp/s2b-S/r1`: home, activity, kit. Corrected sidebar vertical offsets, mobile search alignment, active marker clipping and kit button wrapping afterward.
- `/tmp/s2b-S/r2`: home, activity, kit, sprint-session, flashcards-session. Corrected content bottom spacing and showcase stat-card icon alignment afterward.
- `/tmp/s2b-S/r3`: all five routes; inspected desktop home/activity/kit and mobile home/kit/flashcards. Found the existing missing mobile flashcard feedback entry, then composed a trigger through FocusBar.
- `/tmp/s2b-S/r4`: checked the added focus feedback control; reduced its mobile footprint to preserve room for session progress.
- Final screenshots: `/tmp/s2b-S/r5` (same five routes, both widths).

### Per-route match notes

- **Home chrome:** subject card, nav groups, active edge/pill, exam card placement, user menu, search/theme/avatar header and single sparkle FAB match the template structure and spacing. Home content belongs to slice H and remains outside this change.
- **Activity chrome:** correct active Activity style, identical shared header/sidebar/FAB treatment. Session table/content belongs to slice A.
- **Kit:** section order and desktop paired rows/mobile stacked cards now match. Desktop first two row positions/heights align with the reference. Exact glyph metrics/line wraps differ because the required final Claro Sans/approved logo assets replace the prototype fonts/logo. The kit describes the actual approved font rather than claiming Hanken Grotesk/Space Mono. Final full-page dimensions differ slightly; no new fonts/assets/dependencies were introduced.
- **Sprint session:** existing focus header, desktop feedback icon and mobile tools-menu feedback retained. No sidebar or floating feedback added.
- **Flashcard session:** desktop feedback retained; mobile gains a compact feedback icon before the trailing timer/Finish controls, a deliberate difference needed to keep feedback reachable. Existing Card/Knew labels wrap more tightly beside this control.

## Data and omissions

- Profile name/initials come from the existing authenticated profile; no fixture name or initials were substituted.
- Due badge uses the existing live flashcard due-count query.
- Countdown uses `HSC_EXAM` and `examDaysLeft(sydneyToday())`, passed from the server. Hidden after the exam. The live date yields 7 days on 20 October rather than the frozen reference's 8 days.
- Economics remains the app's single existing subject; chevrons are display-only, with no invented subjects.
- Kit numbers and economics sample copy are explicitly design-system examples from the template, not student performance claims. Token labels are read from computed CSS.
- No data loaders, actions, auth, schema, migrations or production APIs changed. No production network calls or secret/env files accessed.

## Wanted shared changes / residual issues

- `src/components/claro/data-display.tsx` (not owned): round TargetGauge SVG coordinates before serializing. Current server/browser floating-point differences produce a hydration warning in the kit; shown in final harness dev log. Visual geometry is unchanged.
- `StatCard` in that same file should declare `grid-template-columns: 1fr auto` for its icon header. Kit locally composes a wrapper to correct this without changing the shared component.
- `src/components/session-shell.tsx` (not owned): integrate feedback into a mobile flashcard tools menu and give its progress labels adequate non-wrapping width. The owned FocusBar composition keeps feedback reachable now, but the existing Card/Knew header is tight at 390px.
- Home's existing ActivityHeatmap list-key warning remains outside ownership.
- Page bodies outside Kit are intentionally left to their owning slices. Final screenshot body differences are not claimed as matches.

## Checks

- Prettier: all changed files formatted; formatting check passed.
- ESLint: all changed TypeScript/TSX and e2e files passed through `Q_MIN_GB=3 q-run`.
- Whole-project `Q_MIN_GB=3 q-run npx tsc --noEmit`: passed.
- Targeted Vitest (AppShell, kit, foundation, feedback, admin layout, SessionShell, flashcard runner, sprint runner): **8 files / 100 tests passed** through q-run. An initial import-time environment failure was fixed by deferring the feedback Supabase client import until submission; the final run is green.
- Offline Playwright `e2e/foundation.offline.spec.ts`: **3 passed**, including 1440/390 shell, mobile sheet, command palette, Ask Claro, dark mode, and admin search. Run through q-run with an offline intercepted origin; no production server.
- Existing general feedback e2e selector now opens Account menu → Feedback. Real-account feedback/theme/session suites were not run against production; widget submission/retry/linking and both account-menu flows are covered by passing unit tests.
- `git diff --check`: passed. No push, PR or merge.
