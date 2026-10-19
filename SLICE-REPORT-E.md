# Slice E — Auth, profile and account states

## Files changed

- `src/app/(auth)/layout.tsx`, `auth-form.tsx`, `auth-form.test.tsx`, `sign-in/page.tsx`, `sign-up/page.tsx`.
- `src/app/(app)/student/profile/page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`.
- `src/app/not-found.tsx`.
- `src/components/welcome-dialog.tsx`, `feedback-widget.tsx`, `feedback-widget.test.tsx`, `form-field.tsx`, `page-status.tsx`, `profile-form.tsx`, `password-form.tsx`, `profile-history.tsx`, `profile-history.test.tsx`, `try-again.tsx`.
- `src/components/student/account/section-heading.tsx` (private section heading).
- `SLICE-REPORT-E.md`.

## Design matched

These routes have no template view. Used the template kit and STEP 1 foundation as the design reference: existing Claro Sans/logo, token colours, white cards with 16px corners and 20px padding, 15px section headings, 13px descriptions, foundation inputs, pill buttons and semantic status washes. Reused `claro/layout`, `claro/data-display`, `claro/controls` and existing UI primitives; no shared foundation edits, dependencies or CSS files.

Auth uses a responsive centred card and one foundation PageHeader per page. Profile is left aligned, capped at 1400px, with 16px gaps increasing to 20px at 1280px. Details and password stack at 390/768/1024 and share a row at 1440; history and sessions span the full width. Loading cards follow that grid. Table container breakpoints, mobile sorting, truncation, status labels and pagination remain intact. History and not-found states use foundation empty tiles without nested cards.

Welcome, expired-session, offline, form failure, feedback attachment and retry states use the same card/control language. Feedback dialogs scroll within the viewport. The desktop feedback launcher sits above the existing Ask Claro launcher to prevent overlap; the header launcher and `floating` API are retained. Feedback success still uses the existing toast and failure retains the existing message/files and retry action.

## Behaviour and data

No invented data, metrics, activity, exam/term details, decorative scores or new service calls. The dashboard's sample data and examiner marks were omitted because these pages do not have corresponding data or scoring content. Existing loaders, server actions, auth checks, fields, limits, links, query parameters, draft storage/reconnection, password visibility, submission states, feedback uploads and review outcomes are unchanged. `actions.ts` is untouched. Shared exported component APIs remain compatible with admin consumers. No root `error.tsx` or `global-error.tsx` exists, so none was added.

## Wanted shared-component changes

None required. All composition is confined to owned files and the private account folder.

## Validation

- Read the installed Next.js layout, page, error and not-found guides before editing; retained the installed version's `unstable_retry` error API.
- Prettier write and final check: PASS on all changed source files and this report.
- ESLint: PASS on changed source/test files, through `Q_MIN_GB=3 q-run`.
- Whole-project `tsc --noEmit`: PASS through `Q_MIN_GB=3 q-run`.
- Targeted Vitest: 115 tests across 14 files pass (13 files in the combined run, then the feedback file after updating its position assertion). Includes every test importing a changed component, plus auth actions and related shell/results/table tests. New auth tests cover action selection, credentials/return-route payloads, password attributes, announcements and pending submissions. New history tests cover empty states, failure precedence and retry; existing responsive metadata and sort-query coverage retained. Feedback position coverage now asserts the offset above Ask Claro and retains dialog-opening coverage.
- `git diff --check`: PASS.
- No dev server, build, Playwright, production network calls, environment files or database changes. Responsive behaviour was checked in the markup; browser screenshots were not run, per slice instructions.

No push, PR or merge performed.
