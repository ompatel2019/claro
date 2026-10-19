# Slice H — Home

## Scope and implementation

Only owned home files and the explicitly allowed shared components/e2e specs changed. No schema, dependency, font, logo, admin, authentication, or server-action changes. No push or PR.

- `src/app/(app)/student/page.tsx`: real review count in hero, shared activity read, three-column final row with Ask Claro; mobile reading order follows template.
- `src/components/student/home/sections.tsx`: template stat chips/sparklines/deltas, weekly chart/target/type breakdown, plan/ring/estimates/footer, four named parent units with focus treatment, ranked named dot points, compact recent sessions.
- `src/components/student/home/ask-card.tsx`: sheet-matching suggestions and typed questions call the shared `askClaro(text)` entrypoint.
- `src/components/score-trend.tsx`: additive `WeeklyAverageTrend` export; existing `SessionScoreTrend` API unchanged. Smooth cubic curve, gradient area, dashed target, end dot/value, percentage/date axes.
- `src/components/activity-heatmap.tsx`: template-only larger cells, four weekday labels, header navigation, compact footer and honest lit/CTA state. Legacy/admin presentation and keyboard navigation retained.
- `src/components/session-list.tsx`: optional home presentation removes the inner box/dividers, splits title/time/topic, preserves status and routes, and adds earned/possible for finished marked sessions.
- `src/lib/home.ts`: pure helpers for ordered parents, weekly means, seven-day comparisons, dates and estimates.
- Colocated unit tests and the three owned home/offline e2e specs updated for the current layout and named parent/topic fixtures.

## Home match notes — 1440 and 390

1. Topics: four syllabus parents from RPC, sorted; names, count/date metadata, responsive meter placement, lowest-score Focus badge/red meter/pen circle/filled button; Progress link.
2. Marks dropped: named child topics, descending possible minus earned, top coral/others grey, Progress link; truthful 90-day subtitle.
3. Stats: title/icon chips, big values, real question/time sparklines and prior-week pills, Cards due review affordance/tomorrow count. Marks-earned trend intentionally omitted (see below).
4. Average: template hierarchy/copy, top-right table/calendar-style action, percentage/delta/target legend, smooth weekly plot, dashed 80% line/end value, three type columns and real Not started/Try one states.
5. Plan: due/unfinished/qualified weakest parent, up to three items, done state when a real sprint finished today, ring/count, estimates/chevrons, exam footer/Start next. Fixture has no completed sprint today, so shows 0 of 3.
6. Sidebar, logo, topbar and floating buttons remain slice S ownership.
7. Ask Claro: correct third desktop column and last mobile card; same three suggestions as shared sheet; send and prompt wiring tested.
8. Study days: no old expanding gap; header chevrons, stats/flame, month/Mon-Wed-Fri-Sun labels, outline today, lit indicator or real CTA. Recent sessions have icon/title/time/topic, real scores/status, Activity link, no inner border box.

Three visual rounds captured and inspected at both widths. Round 2 exposed long-name plan overflow; round 3 verifies truncation and restored right-side estimates/chevrons. Mobile chart subtitle and Ask card height were corrected after round 1.

## Data derivations and intentional differences

- Totals sum parent topics only, avoiding dot-point double counting. Focus is the lowest non-null parent percentage with answered work. Plan recommendations additionally retain the existing minimum-evidence weak-topic qualification.
- Question deltas compare `activity_days.questions` for today through six days ago against the preceding seven days. Question sparklines use those seven daily counts.
- Study time sums elapsed seconds of valid finished RPC history; sparkline uses finished sessions per Sydney day; pill compares the same two seven-day periods in minutes.
- Score comparisons average marked session percentages, excluding flashcards. Weekly chart buckets are Sydney Monday weeks and average observed marked session percentages; empty weeks are omitted. RPC does not provide per-session earned/possible weights, so this chart is a session-score mean, while the main percentage uses actual earned/possible across the 90-day parent totals. No recall percentages are used as marked-answer scores.
- Card estimate: ceil(count / 3) minutes (20 seconds/card). Unfinished sprint: remaining saved timer, otherwise two minutes per saved actual_questions/legacy count; unknown estimates are hidden. Focus sprint estimate: two minutes per existing builder default question target. Estimates have a one-minute floor. Footer sums available estimates only when every item has one.
- Completed-plan row exists only for a real sprint completed on today's Sydney date, with real completion time and score when available. A current-day activity cell is only lit when activity exists for that day.
- Days studied counts active days in the loaded year; exam date uses `examDaysLeft`. Hero greeting/date/name use current Sydney time and authenticated profile.
- Tomorrow cards come from RPC due schedule. Question-type percentages/counts come from RPC; zero answered renders Not started.
- Dropped marks use child topics in the same 90-day query. A separate 30-day data query was not added just to mimic the template subtitle.
- Omitted marks-earned sparkline/delta: history supplies percentages, not dated earned marks, and activity_days supplies question/card counts. Inferring earned marks from those would fabricate data.
- Omitted flashcard “N/M knew”: home sessions do not load the review outcomes needed to distinguish fully known cards from partial marks. Existing real score/status remains visible.
- Current fixture counts, names, score shape, greeting/date, focus unit, no done-today item, and unlit current day differ from template sample values by design; no fake replacements were introduced.

## Wanted shared changes

- `AppShell` still applies `lg:pr-20` to student SidebarInset, reserving 80px for the old floating controls. Removing that reservation in slice S is required for the template's right edge/card widths and reduces header/footer wrapping. Do not compensate with home-specific negative margins.
- Sidebar logo/subject chevron/exam countdown/user menu, mobile topbar, and two stacked floating buttons are slice S responsibilities. They remain visible differences in this isolated worktree's screenshots.
- Shared Ask sheet's third suggestion is “What should I study before my exam?”; home deliberately matches the actual sheet rather than inventing a Tuesday exam prompt.

## Validation

- Prettier on all changed TS/TSX files: passed.
- ESLint on all changed TS/TSX files: passed.
- Whole-project `tsc --noEmit` through q-run: passed.
- Relevant Vitest suites through q-run: **8 files, 55 tests passed** (home helpers, page, quick-start, sections, Ask card, heatmap, session list and progress-table consumer).
- Offline Home Playwright through q-run: **3 passed**, at 1440, 1280 and 390; fixture-only, no credentials/server required.
- `git diff --check`: passed.
- Visual rounds: `/tmp/s2b-H/r1`, `/tmp/s2b-H/r2`, final `/tmp/s2b-H/r3` (`home-1440.png`, `home-390.png`). Shared read-only mock left running untouched.

The dev harness also emits an existing-style React key warning for the server-provided heatmap action, without rendering or navigation failure. Live credential-based e2e was not run; no production calls or secret files were used.

## H2 — Home polish

### Files and behavior

- `src/components/student/home/sections.tsx`: adds an owned, status=marked attempts read for dated earned marks; projects only `mark,marked_at`, encloses the last fourteen Sydney dates with UTC query bounds, and filters exact Sydney dates in the pure helper. Adds a narrow `session_id,mark` review read restricted to finished flashcard sessions among the five recent rows. Both reads paginate at 1,000 to avoid silently truncating totals; read errors omit the supplemental data. Topics outline buttons now resolve the shared variant's conflicting border utilities locally. Target legend dash uses muted foreground.
- `src/lib/home.ts`: pure `homeEarnedMarks` totals seven daily earned-mark values and compares their sum with the preceding seven days. Prior marked work (including a zero mark) is required for a delta. Invalid, undated, null-mark and out-of-window rows do not contribute. `homeExamPrompt` derives the weekday from `HSC_EXAM.startsAt` in Sydney when the exam is zero through seven days away; otherwise it uses “my exam”.
- `src/app/(app)/student/page.tsx`: starts the marks read alongside other home reads, shares the request's Sydney day with Ask Claro, and resolves the review button's outline border locally.
- `src/components/student/home/ask-card.tsx`: shows and sends the derived exam prompt. The Tuesday text is sent verbatim; the shared sheet's fallback reply is accepted. Its canned reply map and shared file remain unchanged.
- `src/components/session-list.tsx`: additive optional recall counts, used only in home presentation; fully known means `mark === 1`, denominator is every review row for that session. Default/admin consumers retain their score presentation. Home titles use the prototype's 14px size and times use compact `h:mmam` format.
- Tests updated in `src/lib/home.test.ts`, `src/components/student/home/{sections,ask-card}.test.tsx`, and `src/components/session-list.test.tsx` for Sydney midnight/period boundaries, invalid/missing dates, absent prior comparisons, exam timing, owned queries, partial review outcomes, completed plan state and unchanged non-home presentation.

### Read permissions and data notes

- `0002_core_schema.sql` grants authenticated SELECT on both `attempts` and `flashcard_reviews`; their “own or admin read” SELECT policies allow `user_id = auth.uid()`. Later migrations retain those reads. `0048_student_marking_privacy.sql` restricts `mark_reviews`, not these two tables. No service-role bypass, schema change or production request was added.
- The Marks earned headline remains the actual 90-day RPC parent total; its supplemental trend/delta use dated earned marks over the last fourteen Sydney days. No percentage-to-earned-mark conversion is used.
- The shared mock's attempts currently have no `marked_at`. Therefore the screenshots honestly omit the marks sparkline/pill; tests exercise actual dated rows and rendered trend/pill. An empty or failed dated read also omits them.
- The mock flashcard session renders **5/8 knew**, calculated from its eight actual review rows. No template sample count was substituted.
- The mock now verifies **1 of 3**, “Sprint on Inflation”, a real compact completion time and **55%**, a grey done row with green tick, and an outlined lit current-day heatmap cell with “Today is lit”. The footer sums only remaining work (22 minutes in this fixture).

### Visual verification and remaining differences

Two H2 rounds captured and opened at both widths: `/tmp/s2b-H/h2-r1` and final **`/tmp/s2b-H/h2-r2`**. Round two verifies restored outlined Practise buttons, visible dashed target legend, compact session times/title sizing, dynamic Tuesday prompt, completed-plan styling and lit heatmap state. The original template ordering and three-column desktop final row remain intact.

Real fixture values, chart shape, topic focus, timestamps and dates differ from the sample by design. The owned marks-dropped subtitle still states the actual 90-day window. Existing shared shell right padding, logo/topbar, fonts/tokens, feedback/FAB positioning and their resulting desktop widths remain slice S concerns; no compensating layout hacks or non-owned changes were made. The narrower shared desktop Ask column wraps its first and third prompts; it will have the template's available width after the shell reservation is removed.

### H2 validation

- Prettier and changed-file ESLint: passed.
- Whole-project `tsc --noEmit` through q-run: passed.
- Relevant Vitest through q-run: six suites, 49 tests passed (home helpers, home sections, Ask card, session list, home page and quick-start).
- Two screenshot rounds through the required harness on port 3151: passed at 1440 and 390. Shared mock left running untouched.
- `git diff --check`: passed. No push, PR, merge, dependencies, secrets or database changes.
