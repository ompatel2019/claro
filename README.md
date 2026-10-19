# Claro portal

Migration `0051_progress_null_type.sql` (Progress no longer fails with "field name
must not be null" when history includes a non-live question) **is applied to
production** (19 Oct 2026, ~10:16pm Sydney).

Migration `0049_answer_version.sql` (atomic answer versions, guarded auto reviews,
transactional sprint answer saves/finalization) **is applied to production** and has
been live since 16 Oct. Migration `0050_mixed_min_5.sql` (lowers the Mixed sprint
minimum in `start_sprint` from 20 to 5 marks, S3) **is applied to production**
(applied 19 Oct 2026, Mixed minimum 5). The S9 criteria data fix is also **applied
to production**: 6 questions were repaired on 19 Oct 2026; the original rows were backed up
and later archived off-database (migration `0064`).

Student portal for Claro: NSW HSC Economics practice with instant AI marking.
Next.js 16 (App Router, `src/proxy.ts`), Supabase (auth, Postgres with RLS, storage), OpenAI.

## Setup

```bash
nvm use
npm install
cp .env.example .env.local   # then fill in every value
npm run dev
```

## Layout

- `src/app/(auth)`: sign in / sign up; `src/app/(app)/student/page.tsx` student home; `src/app/admin` admin home
- `src/app/api`: marking route handlers (attempt mark/transcribe, flashcard mark, session finish)
- `src/lib/marking`: band-first marking engine (pure grading helpers, prompts, schemas, server engine)
- `src/lib/ai`: OpenAI structured-output calls, per-model prices, cost logging to `ai_usage` and the budget guard
- `supabase/migrations`: every schema change, applied in order (`scripts/sql.sh <file>` runs one via the Management API)
  - Numbering: a new migration takes the next free number above the highest file on `origin/main` (pull first) and never reuses one. Two files share 0027 (`0027_evals_bucket.sql`, `0027_single_check_write_guards.sql`); both are applied on the project (there is no `supabase_migrations` tracking table, files are applied by hand), they are independent, and they stay as they are, applied in filename order.
- `scripts`: content seeding (NESA past papers, flashcards), marking eval, AI spend export

Scripts run with `npx tsx --conditions=react-server --env-file=.env.local scripts/<name>.mts`.

## Quality commands

```bash
Q_MIN_GB=3 Q_SLOTS=1 q-run npm run check # formatting, linting, types, unit tests
Q_MIN_GB=3 Q_SLOTS=1 q-run npm run test:e2e # Playwright; PORT changes server port
Q_MIN_GB=3 Q_SLOTS=1 q-run npm run build
```

S13: written-session Strengths and Top fixes describe observed writing habits (definitions, topic sentences, question focus, evidence and flow), citing specific questions as “Q3”, with one concrete action per Next steps item tied to a named question or topic. The summary uses the actual marked text; mixed-session MCQ choices are excluded from writing evidence. The summary states that MC answers are not supplied and makes no MC performance claims. One-answer advice cites that question without claiming consistency, and sparse evidence does not force invented habits. MCQ-only summaries and per-question feedback retain their existing behaviour. No migration is needed; stored summaries are not regenerated. See [the working writing rubric](src/lib/ai/docs/WRITING-SUMMARY.md), including the pending Om/Karan review and model-quality limits. Regression coverage: marking prompt/engine Vitest tests, results component tests, and `e2e/writing-summary.spec.ts` (synthetic student, no AI calls).

Topic Sprint timers notify with a sound and an overtime banner; students always finish manually, including resumed legacy sessions.

Sprint pace defaults to 1 min per multi and 1.5 min per short-answer mark, both editable (0.25–10). Setup shows an estimate; the saved timer uses the actual selected questions. Apply migration `0039_sprint_pace.sql` before deploying these controls. The five-short-answer quick start estimates about 23 minutes.

Flag for review sits in the bottom answer actions alongside Check answer; flags still persist in the question booklet.

Topic sprints offer Multiple choice, Short answer and Mixed (MC + shorts). Essays
remain available in Mark my answer and existing results; they are excluded from
new sprints, including legacy saved setups. Apply `0040_sprints_no_essays.sql`.
Sprint regression coverage: `src/lib/sprint.test.ts`,
`src/app/(app)/sprint-actions.test.ts`, `e2e/sprint-feedback.spec.ts` (mobile/desktop).
Use `Q_MIN_GB=3 Q_SLOTS=1 q-run` for checks and Playwright on the shared box.
Questions always run in exam order: MC first, then short answers. Existing
shuffled sprints resume in the same grouping. Apply `0041_sprints_exam_order.sql`.
Setup is a four-step wizard (question type → topics → size → timer/feedback).
The summary stays visible; Start and ⌘/Ctrl+Enter work on the last step. Back keeps
choices, Reset returns to step one, and Advanced holds history and extra filters.

Use Node 22 (`nvm use`). Local checks need `NEXT_PUBLIC_APP_URL` set; authenticated Playwright tests additionally use synthetic `STUDENT_EMAIL` / `STUDENT_PASSWORD` and the Supabase settings from `.env.local`. Progress specs create isolated synthetic accounts. Never commit credentials.

In check-as-you-go sprints, Next shows a reminder on hover or focus for an unchecked answer and highlights Check answer. Navigation remains available.

Written checks show the saved marked answer, all comments and the full-mark outline inline using the same feedback as results. Wide screens have margin comments; small screens stack them. Once a non-empty written answer is marked in check-as-you-go mode, the mark API also returns the question's stored model answer (read server-side; no new AI call, no schema change), and the inline view shows it under **Model answer** exactly as results do; resuming the sprint reloads it. Marking guidelines and second-check/review details are not shown inline; they stay in finished results. Unit coverage: `src/app/api/marking.test.ts`, `src/lib/practice-data.test.ts` and `src/components/sprint-runner.test.tsx`. `e2e/sprint-model-answer.spec.ts` skips without `STUDENT_EMAIL` and mocks the mark API; it covers UI behavior only, not real marking or server-side model-answer reads.

Mark my answer defaults to the Claro bank. Set the server flag `ENABLE_OWN_QUESTION_MARKING=true` to show My own question. The flag is off by default and also gates new own-question checks on the server; saved own-question sessions still resume and mark. Own questions require clear, complete mark bands: unreliable criteria return a short note with no score; valid criteria receive an estimated mark without tutor examples. Similar-topic example retrieval is out of scope. Stale unsaved own-question drafts keep their answer text and require a bank selection.

## Flashcards

Deck size (20 selected by default) and Answer by sit beside Mode. The summary and Start button sit at the bottom after all setup sections, including Source, and scroll with the page without covering options. Study lets students type or speak before flipping and self-rating; Test checks their answer. Typing remains available if speech is unsupported or denied. List view and missed-card repeats remain available.
Tests: `src/components/flashcard-{builder,runner}.test.tsx`, `e2e/flashcard-{builder,session}.spec.ts` cover setup, bounds, empty decks, answer drafts, speech fallback, repeats and mobile/desktop flows. Run heavy checks through `Q_MIN_GB=3 Q_SLOTS=1 q-run` on the shared box.

## Admin dashboard (Karan A1)

A1 in `/workspace/claro/karan-items.md` explicitly says to keep the dashboard as-is,
especially AI spend per day. The four KPIs, 30-day sessions/spend charts, attention
links and latest finished sessions remain as defined in `FEATURE_SPEC.md` §4.1.
Dashboard numbers come from the admin-only `admin_dashboard` SQL RPC; each chart
lets admins inspect a Sydney day using its graph or keyboard-accessible selector.
No migration or runtime change is needed for A1.

Regression coverage: `src/app/admin/page.test.tsx`, `src/lib/admin-data.test.ts`
and `src/components/daily-chart.test.tsx` cover totals, zero/empty states, spend
caps, permissions, errors and daily inspection. `e2e/admin-dashboard.spec.ts`
checks the authenticated dashboard and chart controls on desktop and mobile.
Run `q-run npm run check` and
`q-run npm run test:e2e -- e2e/admin-dashboard.spec.ts --workers=1` with public
app/Supabase settings and synthetic `ADMIN_EMAIL` / `ADMIN_PASSWORD` exported.

## Question imports

Questions enter through offline import scripts as drafts; the bank's Import action opens Import review. Manual creation is closed. Existing drafts and published questions remain editable, with numbered Topic then Subtopic selectors (also used for bulk moves and import-review filters). Tests in `e2e/admin-questions.spec.ts` and the question editor/page/action unit suites cover import review, editing, validation, errors and responsive layouts.

## Mark reviews

Students select **Question this mark** beside written feedback on finished results and give a 10–1,000 character reason. Limits: one request per answer, three open, five per Sydney Monday–Sunday week, and 48 hours after an unchanged/lowered review. An atomic RPC enforces the limits; the admin queue shows all-time history and rejection rates based on resolved disputes. Duplicates return 409, limits and the cooldown return 429, and only real failures return 503. Apply `0043_dispute_guardrails.sql` and `0045_dispute_limit_statuses.sql` before deploying.

Tests: dispute route/dialog/history unit suites and `e2e/dispute-guardrails.spec.ts` cover concurrent caps, cooldown expiry, invalid/foreign attempts, errors, and mobile/desktop queue/results flows using isolated synthetic accounts.

## AI spend by mark value

Spend shows maximum-mark bands (1–2, 3, 4, 5–6, 7–8 and 9+). Individual marking, retries and transcription log their attempt ID; averages divide linked costs by distinct tracked marked answers. Historical and batch-engine calls lack that link and remain explicitly unallocated. Invalid/non-finite costs display safely. Apply `0044_usage_attempt_attribution.sql` before deploying; the marking engine remains unchanged.

Tests: spend data/page/helpers, loader, async-context and usage-logging unit suites; `e2e/admin-spend.spec.ts` and `e2e/spend-mark-values.spec.ts` cover bucket boundaries, malformed/free/untracked costs, empty ranges and mobile/desktop layouts.

Mixed sprints link MC question count and short-answer marks to the selected total.
Changing the total starts an even split (an odd mark goes to MC); Back and reload
keep an edited split. Buckets fill independently, with whole shorts nearest their
target within the existing two-mark tolerance where possible. Timer estimates
use the split and editable pace; saved timers use the actual selected marks.
Apply `0046_sprints_mixed_buckets.sql`. Coverage adds `e2e/sprint-mixed.spec.ts`
(mobile/desktop, exact fills, zero buckets, shortfalls and invalid RPC input) and
`supabase/tests/sprint_mixed.sql` (transactional selection regression).

## Progress

Student Home (`src/app/(app)/student/page.tsx`): greeting/date; a navy hero with the
NSW term, large week number, a daily Claro line and one dot per week of term
(`schoolWeek`/`dailyQuote` in `src/lib/home.ts`); four large launch tiles (Topic Sprint,
Flashcards with due count, Mark my answer, Activity) beside "Your study days"
(`ActivityHeatmap` `home` variant: day streak, longest streak, days studied, today
marker, Less/More legend, "Light up today" starts due flashcards in one click, else
opens Topic Sprint); then a Study hub tile per top-level topic linking to
`/student/sprint?topics=<id>`. Data comes from the existing `activity_days` and
`activity_streaks` RPCs; no migration. Unfinished sessions are listed in Activity, not
Home. Coverage: `src/app/(app)/student/quick-start.test.tsx`, `src/lib/home.test.ts`,
`e2e/pages.offline.spec.ts` (offline, synthetic reads) and `e2e/student-home.spec.ts`.

Brand: `public/logos/` holds the marketing-site lockup and mark SVGs (white variants
in dark theme via `src/components/logo.tsx`); the lockup is used in the sidebar,
mobile header, auth pages and marking screen, the mark in the collapsed sidebar.
The tab/app icons (`src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`)
are the claro-marketing site's icon copied byte for byte (full-bleed #e86239 tile,
white C and dot); `scripts/tab-icons.mjs` builds `favicon.ico` from `icon.svg`. The sidebar/header still use the
lockup/mark SVGs.
`public/og/claro-student-og.png` (generated by `scripts/og-student-card.mjs`) is the
Open Graph/Twitter image (`src/app/layout.tsx`).

Progress leads with topic,
question-type and directive-verb breakdowns, then score history and flashcard mastery.
Question weak spots require 3 marked answers across 2 distinct sessions per subtopic;
apply migration 0047 before using the new history counts. Missing counts keep spots locked.

Run checks serially on the shared box with `Q_MIN_GB=3 Q_SLOTS=1 q-run npm run check`.
Export the public app/Supabase env first, or load `.env.local` with
`q-run node --env-file=.env.local /usr/bin/npm run check` on this box.
Run browser coverage with the same queue settings and `q-run npx playwright test e2e/weak-topics.spec.ts e2e/progress.spec.ts --workers=1`.
The weak-topic specs create and delete isolated synthetic students using Supabase env
credentials. Progress specs use the same isolated fixture. Load `.env.local` when
invoking Playwright (for example,
`q-run node --env-file=.env.local node_modules/@playwright/test/cli.js test e2e/weak-topics.spec.ts --workers=1`).
Database assertions in `supabase/tests/weak-topic-samples.sql` run after migration
0047 via `q-run bash scripts/sql.sh supabase/tests/weak-topic-samples.sql`; fixtures
and all their writes roll back.

The student and admin headers include a keyboard-accessible Dark mode toggle. The initial theme follows your system, and explicit choices are saved in this browser. Choose “Use system theme” in the account menu to reset it. A synchronous head script sets the theme before paint; panels, controls, charts and activity shades share light/dark tokens.

## Marking accuracy (A4)

Check agreement has a keyboard/hover tooltip: it measures current AI checker
agreement, not human accuracy. Admin-verified accuracy is exact AI/final-mark
agreement on comparable written spot checks and checker disagreements resolved
by an admin in the selected range. It excludes every student dispute and shows
the sample count; it describes a selected review sample, not overall accuracy.

Dispute counts, override rate and mark-change breakdowns exclude disputes from
currently blocked accounts and repeat disputers: at least 3 all-time resolved
disputes, with at least half unchanged or lowered (A3's rejection definition).
Legitimate repeat disputes with lower rejection rates remain included. The page
shows the excluded count. Staff reviews remain included for all students.
No database change or migration is required.

Coverage: accuracy data/page/tooltip Vitest suites and
`e2e/admin-marking-accuracy.spec.ts` (tooltip keyboard/hover/touch, range changes,
admin metric and phone layouts). Run with `q-run npm run check` and
`q-run npx playwright test e2e/admin-marking-accuracy.spec.ts --workers=1`.
Authenticated browser tests need the admin credentials described above.

## A1 mock calibration (A5)

Engine → Eval runs shows exact human marks and human-mark agreement for the latest full held-out A1 backlog run, separately from AI blind-check agreement and the Karan benchmark. The existing mock bank covers 41 questions; the anonymised export contains 2,203 human-marked answers (196 held out, 2,007 calibration examples). Private scripts stay outside git. A1 is read-only.

Validate an anonymised export locally before importing into Claro:

```bash
npx tsx --conditions=react-server src/lib/ai/eval/import-a1-examples.mts /path/to/snapshot.json --dry-run
```

Dry-run needs no credentials and makes no database calls. It rejects invalid marks, unknown questions, duplicate hashes, repeated answer text and overlap with the separate `a1-eval-set.json` benchmark. The seeded split and existing grader view keep held-out scripts out of prompts. See [ENGINE](src/lib/ai/docs/ENGINE.md) for offline evaluation and import details. No new migration is required for A5.

MCQ explanations support concept-first feedback in checked sprints, resumed checks,
finished results and the admin preview. Structured content is stored as JSON text
in the existing `questions.explanation` column; legacy Markdown still renders.
The mark API adds `structured_explanation` after an owned check-mode answer is
locked. No schema change or migration is needed. See [the MCQ content contract](docs/mcq-explanations.md).
Coverage: parser, shared renderer, sprint runner, owned-session loader and mark API
Vitest suites; `e2e/mcq-explanation.spec.ts` exercises real marking, key withholding,
resume, correct/wrong/unanswered results and mobile/desktop layouts with temporary
synthetic students/questions. Run with the same queue and env settings above.
E2E fixtures refuse non-local Supabase URLs unless the project ref is listed in `E2E_TEST_SUPABASE_REFS` (see `e2e/guard.ts`).

Own-question suggestions: set `ENABLE_OWN_QUESTION_MARKING=true` and `ENABLE_OWN_QUESTION_AUTOFILL=true` (exact lowercase values). Autofill runs once on leaving a changed question of at least 10 characters. It suggests the topic, marks, directive verb and complete mark bands; student edits are preserved. Changing the question re-detects the verb, including after draft restore. Empty guidelines are generated server-side before marking; failures leave a saved answer with Retry. With autofill off, the existing criteria requirement applies.

Autofill uses the existing cheapest priced model, `openai/gpt-6-luna`, through OpenRouter (`MODELS.ownQuestionAutofill`). It validates topics and complete band coverage, retrying invalid output once. A separate allowance checks for 10 logged model calls per student per Sydney day, including retries and submit fallbacks; it does not use the 20 marking checks. It follows the existing usage-count rate-limit pattern (concurrent requests can race the count). Calls use the shared spend cap and log tokens and USD to `ai_usage` as `own-question-autofill`; no migration is required. Tests mock all model calls. Run the credential-free browser regressions with `q-run npx playwright test --config=e2e/own-question.config.ts` (read-only local auth/data double).

The checks-left card now sits in page flow. The desktop (lg+) feedback button is `position: fixed` bottom-right so it adds no document height: student home no longer scrolls at 1366×768 or 1280×720 (`e2e/pages.offline.spec.ts`). Desktop content keeps `lg:pb-12` clearance. Phones use the header icon. The student bottom-position audit found no other content bars to remove; admin review controls and dialog/sheet overlays retain their positioning.

## Iteration 2 — Lane A: S3

Mixed sprints accept a five-mark minimum. Size inputs keep the entered value and show an inline range hint; invalid totals block Start instead of silently snapping on blur. Presets and saved settings use the same limits.

## Iteration 2 — Lane A: S2

The unfinished-sprint banner shows the actual Finish server error, catches network/non-JSON failures, prevents duplicate submissions, and offers View results on failure. A read-only session check recovers straight to results when the server finished despite a lost response. Reset remains a local setup reset. Synthetic browser tests never call real marking.

## Iteration 2 — Lane A: S6

Runner Finish failures check the session’s finished state before showing an error, recovering to results after a lost response. Unfinished failures keep answers editable, show the real error and a View results recovery link. The setup banner links to results when every attempt is marked. All-marked attempts alone do not trigger an automatic finish. Engine timing is unchanged.

## Iteration 2 — Lane A: S4, S5 and S12

Feedback is presented as Check as I go and Exam mode cards with dot-point descriptions. Stored values remain `each` and `end`, with no timer or migration change. The runner, banner Finish and Mark my answer submission share one simple full-page Claro marking screen. It uses polite status announcements and respects reduced motion, with no invented progress percentages. Mark my answer keeps its form mounted and draft intact during submission; its background marking/navigation flow is unchanged.

### Lane A integration dependency — S3

The setup accepts five Mixed marks, but the existing `start_sprint` RPC in migration 0046 still enforces a 20-mark Mixed minimum. Lane A does not change SQL or add a migration. Starting a five-mark Mixed sprint requires the database owner to resolve this separately; the synthetic tests exercise UI/config behaviour only.

## Iteration 2 — Lane B: feedback guards (S8, S9, S10, S13)

Student margin comments no longer repeat the per-comment “Next mark” line;
its stored value, admin editor and aggregate next-mark summary remain intact.
“How to reach full marks” is hidden for full-mark written answers in both sprint
and single-answer results. Rubric tables and band labels require complete,
non-overlapping integer coverage of 1..marks (an optional zero band is accepted).
Incomplete tables show an unavailable message. The normal admin Questions
“Missing or incomplete criteria” filter finds missing bands before pagination.
Import review retains its existing missing-criteria filter. No data repair,
migration or marking/prompt change is included.

## Iteration 2 — Lane B: results next steps and date (S7, S11)

Next steps now leads overall feedback in a full-width highlighted section above
strengths and fixes. Deterministic actions practise weak topics, retry mistakes,
and open available topic flashcards; question links beside practice actions and
full-mark/lost-mark groups identify MC versus written answers without rewriting
or attributing stored AI advice. Pending and unavailable summaries retain actions.
The sprint header shows the Sydney calendar date without clock time; elapsed
sprint duration remains. Prompt changes belong to claro-ml's Airo 5.1 work.

Run the isolated, read-only results browser suite with
`Q_MIN_GB=3 Q_SLOTS=1 q-run npm run test:e2e -- --config=e2e/sprint-results.config.ts`.
It starts local Next/Supabase doubles, blocks marking/writes, and covers mobile,
desktop and single-answer feedback. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when
using system Chrome. Credential-dependent legacy specs are skipped without a
configured test student. Never point these tests at production.

## Iteration 2 — Lane C: pages (S1, S11, A1, A2)

Student Home now shows the date/greeting, a NSW term/week banner with a daily practice line, four launch tiles, streak and one latest unfinished session. Due-card and streak read failures keep the launch links available. Weak-topic practice and score history remain on Progress; the Home-only trend and its reads/helpers were removed. The custom icon set supplies all four tiles and the new streak glyph.

Activity puts the score beside the title with a kind icon and date, hides finished status, and removes duration, item and action columns and the KPI card row. Existing newest-first ordering, filters, pagination and canonical report links remain.

The admin dashboard promotes clickable Needs attention above charts and replaces the ten-row table with at most three recent sessions linking to the student's Sessions activity/report. Admin flashcard filters offer parent Topic followed by its Subtopic; changing parents clears stale subtopic selections. No database or marking changes.

Validation: `Q_MIN_GB=3 Q_SLOTS=1 q-run npm run check`; offline browser coverage uses `q-run npm run test:e2e -- --config=e2e/pages.config.ts` (real pages/components and compiled app CSS, synthetic reads, installed Chrome). Credential-based home/activity/admin specs also cover the revised UI; use an isolated allow-listed test Supabase only. See `LANE_NOTES.md` for local outcomes and cross-lane follow-ups.

Lane C annotated local page evidence: [Home, Activity and admin pages](docs/it2-lane-c.md).

### Iteration 3 — small fixes

- Results while Finish is still marking: `finished_at` is only set once marking and the summary complete, so the results URL used to redirect to the question page. It now shows a "Marking in progress" state with the usual progress bar (auto-refreshing) while an answer has a fresh `marking` claim (or, in exam mode, once any answer is marked), and fills in when done. With no marking in flight it still redirects to the question page. No migration.
- Results page stuck blank after marking (follow-up to the above): in exam mode (`feedback: end`) the in-progress state holds until `finished_at` is set, but the progress card only polled while an answer was still `marking`, so a second tab went blank once all answers were marked and stayed so until manual reload. The in-progress card now keeps refreshing (every 2 s, 5 s after 30 s, stopping after 10 min) until the server render is no longer in progress, refreshes immediately when marked reaches total, and shows "Finishing your results…". If every answer is marked but `finished_at` is still unset after 15 s (marking tab closed), the page calls the existing idempotent `POST /api/sessions/[id]/finish` once, which finalises the session. No schema change. Tests: Vitest (`marking-progress.test.tsx`) and offline Playwright (`sprint-feedback.spec.ts` with timed mock sessions 0007/0008 in `e2e/sprint-results-mock.mjs`).
- Admin flashcards Add, Edit and Move dialogs: review found the single "Topic · Subtopic" list was ordered by raw `sort`, which restarts per topic, so subtopics from different topics interleaved. `subtopicOptions` now groups them by topic order. Selecting, saving and moving were otherwise correct (server validates a subtopic). Covered by Vitest (ordering, Add save, Edit save/change topic, Move); the admin page needs the service role, so no offline Playwright exists for it, and no production data was written to verify.
