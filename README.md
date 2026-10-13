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

- `src/app/(auth)`: sign in / sign up; `src/app/page.tsx` student home; `src/app/admin` admin home
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

Use Node 22 (`nvm use`). Local checks need `NEXT_PUBLIC_APP_URL` set; authenticated Playwright tests additionally use synthetic `STUDENT_EMAIL` / `STUDENT_PASSWORD` and the Supabase settings from `.env.local`. Never commit credentials.

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
