# Claro portal

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

Written checks show the saved marked answer, all comments and the full-mark outline inline using the same feedback as results. Wide screens have margin comments; small screens stack them. The current mark API does not return guidelines, model answers or checker/review metadata, so these remain in finished results.

Mark my answer defaults to the Claro bank. Set the server flag `ENABLE_OWN_QUESTION_MARKING=true` to show My own question. Own-question schemas and API remain available; saved own-question sessions still resume. Stale unsaved own-question drafts keep their answer text and require a bank selection.

## Flashcards

Deck size (20 selected by default) and Answer by sit beside Mode. Study lets students type or speak before flipping and self-rating; Test checks their answer. Typing remains available if speech is unsupported or denied. List view and missed-card repeats remain available.
Tests: `src/components/flashcard-{builder,runner}.test.tsx`, `e2e/flashcard-{builder,session}.spec.ts` cover setup, bounds, empty decks, answer drafts, speech fallback, repeats and mobile/desktop flows. Run heavy checks through `Q_MIN_GB=3 Q_SLOTS=1 q-run` on the shared box.

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

Student Home always shows the Topic Sprint presets and Flashcards launch boxes
immediately below the header, including the due count (zero when none are due).
Summary stats, activity heatmap, score trend/recent activity and unfinished
sessions/weak topics follow. Continue appears only when there are unfinished
sessions; loading failures keep the launch boxes available with a retry for the
unavailable due count. No migration is needed for this layout.
Coverage: `src/app/(app)/student/quick-start.test.tsx` and `e2e/student-home.spec.ts`
(empty history, unfinished sessions and due cards at 360px and 1280px).

Home owns the summary stats and yearly activity heatmap. Progress leads with topic,
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
