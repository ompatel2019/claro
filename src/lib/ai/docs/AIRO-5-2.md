# Airo 5.2

23 Oct 2026. **Prompt tweak; unit-tested only. Results pending: no paid eval or benchmark run yet, and no accuracy, feedback-quality or improvement numbers are claimed.**

Source: S22 (Karan call, 23 Oct, short answer review): "He does not fully agree with the marking comments; one he called 'not correct'." Proposed fix: "Review the short-answer comment prompt against his marking."

## Change

The full grading prompt in `src/lib/marking/prompts.ts` adds tutor-style comment rules. Comments are written like an experienced HSC tutor's margin notes: correct for the question, usually one short sentence, and naming the exact fix.

| Rule                     | Basis in Karan's marking                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Statistics only if asked | His A1 critiques called "add a statistic" advice wrong on questions that do not require one (four of 20 items).             |
| Keep needed definitions  | He disagreed with advice to drop a definition the question requires, and wants loose definitions made more direct.          |
| Flag waffle and length   | He wanted a useless first sentence called out, and wanted 2-4 mark answers told when they are already long enough.          |
| Say plainly what's wrong | He marked a wrong term (e.g. "upswing" for cyclical unemployment) as an error the feedback missed.                          |
| Name the exact fix       | He asks for the key term or the main cause-and-effect step to be named directly; A1 tutor comments are short and exact.     |
| Verb needs               | Distinguish needs an explicit contrast ("whereas"); discuss needs both sides; assess needs a judgement and where to add it. |
| Syllabus only            | He flagged sample content beyond the HSC course.                                                                            |

Critiques are from the A1 eval set (`src/lib/ai/eval/a1-eval-set.json`, `karanFeedback`). Comment length is from an aggregate read-only count of A1 margin comments: tutor median 47 characters against 143 for AI improvement comments.

## Effect on marks

Comments come from the same first-pass grader call that produces the first mark, so this prompt change **can shift first-pass marks**, and therefore final marks when the passes agree. The blind check and reconcile prompts are byte-for-byte unchanged (the check variant is still derived from the shared prefix before "Return the full JSON").

## Results (pending)

Not run. The held-out benchmark (196 answers, 41 questions, 678 marks) measures marks only; the A1 section's judge (pros kept, cons fixed against Karan's critiques) is the comment measure. Both need PM approval before any paid run.
