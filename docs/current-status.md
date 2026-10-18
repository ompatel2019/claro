- S8: sprint expiry keeps answers editable and shows overtime until manual finish; the automatic finish setting is removed.

- S7: editable multi/short pace replaces flat custom minutes; `start_sprint` computes time from the actual selection. Legacy saved setup pace is reset to the new defaults.

- S9: flagging moved from the question header to the answer action row. Keyboard and persistence behavior are retained.

- S12: unchecked answers get a Next tooltip and highlighted Check action; navigation remains available and keyboard checking ignores empty or already-checking answers.

- S10 UI: inline written feedback reuses AnnotatedFeedback and the existing mark payload without an extra marking pass. Stored model answers are returned and reloaded only for marked written answers in unfinished check-as-you-go sprints, excluding No answer results. Guidelines and checker/review metadata remain in results. The Playwright model-answer spec requires STUDENT_EMAIL and mocks the mark API; server read boundaries have unit coverage.

- S16: validated own-question criteria, deterministic no-score feedback for unreliable rubrics, and estimated marking without example retrieval; server gates reject own-check creation, marking and transcription when off; restrictions reach prompts, ambiguous/malformed bands are rejected, and admin final marks clear unreliable feedback. UI: own questions are hidden by default behind ENABLE_OWN_QUESTION_MARKING; empty-state copy suggests search/filter changes. Schema and API are retained, and saved legacy sessions remain readable.

- S11: one concept-first MC explanation renderer is shared by inline checks,
  resumed checks, results and previews. Structured JSON text is supported alongside
  legacy Markdown; the owned mark API adds validated structured fields. No schema
  change. Existing bank prose still needs the separately tagged ML/content rewrite.

## Iteration 2 — Lane C (19 October 2026)

- **S1:** compact student Home, four launch tiles, term/week banner, rotating original study lines, due count, streak, one resume card. Home uses streak-only rather than a year heatmap. Weak topics and score history are available through Progress. Progress's session chart remains in `score-trend.tsx`; its Home-only daily chart is removed.
- **S11:** two-column Activity list (title/score/status as needed, date); no durations or KPI cards. Row and keyboard-accessible title links open the existing reports. Newest-first remains the default and other sorts stay in the filter.
- **A1:** full-width Needs attention appears directly after stats, before charts. Its existing conditions and destinations are retained. Recent sessions is a three-row mini-list; links use the actual student Sessions/report query parameters.
- **A2:** parent-only Topic and dependent Subtopic filters. A valid child narrows the selected parent; stale/unrelated children are ignored and removed from displayed filter values. Existing add/edit/move dialogs belong to another file and are recorded as a follow-up in Lane notes.

School dates use NSW Eastern division student attendance dates for [2026](https://education.nsw.gov.au/schooling/calendars/2026) and [2027](https://education.nsw.gov.au/schooling/calendars/2027), checked 19 October 2026. Weeks start Monday (a midweek return is Week 1); holidays show School break, unsupported years show Your study week. School-specific/Western division exceptions are not personalised.

The offline Playwright suite exercises real page/component code with synthetic data and the app CSS; it performs no Supabase or AI calls. Authenticated specs require isolated test credentials. No live production screenshots or Claro Docs writes were performed from this lane.
