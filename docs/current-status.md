- S8: sprint expiry keeps answers editable and shows overtime until manual finish; the automatic finish setting is removed.

- S7: editable multi/short pace replaces flat custom minutes; `start_sprint` computes time from the actual selection. Legacy saved setup pace is reset to the new defaults.

- S9: flagging moved from the question header to the answer action row. Keyboard and persistence behavior are retained.

- S12: unchecked answers get a Next tooltip and highlighted Check action; navigation remains available and keyboard checking ignores empty or already-checking answers.

- S10 UI: inline written feedback reuses AnnotatedFeedback and the existing mark payload without an extra marking pass. Stored model answers are returned and reloaded only for marked written answers in unfinished check-as-you-go sprints, excluding No answer results. Guidelines and checker/review metadata remain in results. The Playwright model-answer spec requires STUDENT_EMAIL and mocks the mark API; server read boundaries have unit coverage.

- S16 UI: own questions are hidden by default behind ENABLE_OWN_QUESTION_MARKING; empty-state copy suggests search/filter changes. Schema and API are retained, and saved legacy sessions remain readable.
