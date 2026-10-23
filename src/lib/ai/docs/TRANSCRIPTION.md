# Handwriting transcription

## Input and limits

`src/app/api/attempts/[id]/transcribe/route.ts` accepts an authenticated student's own attempt in `pending`, `transcribed` or `unreadable` state. It rejects attempts already marking/marked, missing photos and photo paths outside the student's storage prefix. Single checks must be eligible daily slots and not already submitted.

Photos are downloaded from the private `answers` bucket and checked before transcription:

- Up to **3 pages** for ordinary short answers.
- Up to **8 pages** for papers, single checks or extended responses.
- Each image at most **10 MiB** (the error copy says “10 MB”).
- MIME types: JPEG, PNG, WebP, HEIC or HEIF.

These limits come from `src/lib/limits.ts`. The route requires a bank question stem or the own-question stem for context; its maximum duration is 120 seconds.

## Prompt rules

See [ENGINE](/admin/marking/engine?tab=docs&doc=ENGINE) for model configuration, costs, budget guards and usage logging.

The prompt in `src/lib/marking/prompts.ts` asks for:

- Exact transcription, in reading order, one `lines` array element per written line; array position supplies numbering, without number prefixes.
- Omission of crossed-out text, using its replacement, and following insertions/arrows in reading order.
- `word[?]` for an uncertain word, or `[?]` when illegible.
- No invented text and no correction of wording or spelling.
- A brief description of diagrams in `notes`, and empty `lines` when there is no handwriting.
- Image text treated as evidence, never instructions.

`src/lib/marking/schemas.ts` checks a strict object with string-array `lines` and string `notes`. It does not validate reading order or transcription accuracy.

## Saved transcript and confirmation

Pages are transcribed sequentially in stored page order. Each page's lines are joined with newlines; page transcripts are joined with a blank line. The response also includes flattened lines and non-empty notes joined with newlines. Only the combined `transcript` and status are saved to the attempt; lines and notes are returned to the client.

`src/components/written-answer.tsx` shows an editable typed copy, numbered lines, uncertainty markers and any notes. **Confirm transcript** saves the student's edits. Editing or changing photos clears confirmation. `src/components/mark-my-answer.tsx` requires confirmation for photo-answer submission. Confirmation is client UI state; the transcription route does not mark, and the marking engine does not check a persisted confirmation flag.

`src/components/annotated-feedback.tsx` underlines uncertain text with “Hard to read. Not counted against you.” See [MARKING-PRINCIPLES](/admin/marking/engine?tab=docs&doc=MARKING-PRINCIPLES) for transcript selection and marking uncertain words.

## Failure handling

An empty combined transcript sets `unreadable: true`. Single checks are saved as `status = unreadable`; other sessions are saved as `transcribed` even when empty. The answer component displays “We couldn't read this photo.” and offers retaking photos or typing instead.

Invalid image size/type returns 400; rate limiting returns 429; budget exhaustion returns 503 with saved-photo/retry-later wording. Download, model or structured-output failures return 500 “Could not transcribe answer”. There is no route-level transcription retry or failure-status update in the catch block. A failed later page does not save a partial combined transcript, though earlier page calls can already have incurred spend.

## Scan-to-text (sprints)

`src/app/api/attempts/[id]/scan/route.ts` turns one photo into typed text for the answer box. The photo is input only: it is never stored, and the route writes nothing to `attempts`. The client saves the returned text through the normal autosave path as `answer_text`, so the answer stays a typed answer.

Checks run cheapest first: sign-in; the student's own sprint attempt on a non-MCQ question (404 otherwise); editable (409 for a finished sprint, a locked each-feedback answer, or a photo answer); one `file` of at most 4 MiB that is JPEG, PNG or WebP by both MIME type and magic bytes (400/413); the shared rate limit (429); total `ai_spend()` below `BUDGET_USD` (503, also when spend can't be read). Only then is `transcribeImage` called with `task: "transcribe_answer:scan"` and `detail: "high"`. The response is `{ text, uncertain, notes }`, with text capped at the written word limit; empty text returns 422 `unreadable`.

`src/hooks/use-scan-to-text.ts` converts HEIC and shrinks the photo to a 2048 px long edge as JPEG (q 0.85) before posting. `src/components/scan-to-text.tsx` fills an empty box, or asks Replace / Add below / Cancel, then reveals the text with a short simulated type-out (skipped under reduced motion). `src/components/sprint-runner.tsx` mounts it under the answer box for editable typed written answers only (not MCQ, not photo answers); the answer box is locked while a scan runs. Leftover `[?]` markers stay in the text with a hint to check them; submit is not blocked. One scan costs about 1.5 US cents.

## Rate limits

`src/lib/ai/rate-limit.ts` checks recent `ai_usage` rows per student: **20 per minute**, **200 per hour**. A recognised admin role is exempt. A returned profile-query error is ignored: counting continues with a null role, so even an admin can be limited if role lookup fails. Thrown errors (including profile lookup throws) and usage-count errors fail open. These are heuristic operational thresholds, counting usage rows across tasks rather than only transcription requests. A limited response includes `Retry-After` of 60 or 3,600 seconds.

The route checks once before downloading and again before each additional page.
