# Airo 5.2

23 Oct 2026. **Prompt tweak, evaluated on 23 Oct (runs 1414 and 1417). Baseline is run 1415 (9 Oct, before Airo 5.0), so every delta below combines Airo 5.0, 5.1 and 5.2; no saved 5.1 run exists to isolate 5.2.**

Source: S22 (tutor call, 23 Oct, short answer review): "He does not fully agree with the marking comments; one he called 'not correct'." Proposed fix: "Review the short-answer comment prompt against the tutor's marking."

## Change

The full grading prompt in `src/lib/marking/prompts.ts` adds tutor-style comment rules. Comments are written like an experienced HSC tutor's margin notes: correct for the question, usually one short sentence, and naming the exact fix.

| Rule                     | Basis in the tutor's marking                                                                                                |
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

## Results

Marker `anthropic/claude-sonnet-5.5` (low / low / medium), judge `gpt-6-astra` (low), commit cf6867f, clean tree. Result files stay local (they quote student answers); they are not committed.

**Baseline: run 1415 (9 Oct, Sonnet 5.5, before Airo 5.0).** Deltas cover Airo 5.0 + 5.1 + 5.2 combined, not 5.2 alone.

### A1 comment check (run 1414, items 0-19, judge on)

Headline n = 18 (fm-1 and ei-4 excluded).

| Metric                         | 1415  | 1414 (5.2) |
| ------------------------------ | ----- | ---------- |
| Judge mean (1-10)              | 5.11  | 6.28       |
| Judge mean, all 20             | 4.95  | 6.10       |
| Pros kept                      | 66.7% | 73.3%      |
| Cons fixed                     | 33.3% | 45.5%      |
| Exact                          | 61.1% | 66.7%      |
| Within-1                       | 94.4% | 94.4%      |
| Mean signed (+ = lenient)      | +0.39 | +0.33      |
| Comments asking for stats/data | 7     | 1          |

One mark changed on the 20: ei-1 moved from 2 to 1, matching the tutor mark. The largest judge gains were ge-3 (3 to 9), ei-1 (4 to 9) and ei-2 (4 to 10).

### Held-out (run 1417, 196 answers, 41 questions, 678 marks)

| Metric                    | 1415 (194 scored) | 1417 (5.2, 196 scored, 0 errors) |
| ------------------------- | ----------------- | -------------------------------- |
| Exact                     | 45.9%             | 52.6%                            |
| Within-1                  | 96.9%             | 95.4%                            |
| Mean signed (+ = lenient) | +0.07             | -0.01                            |
| Mean \|Δ\|                | 0.57              | 0.52                             |
| First-pass exact          | 44.8%             | 50.0%                            |
| Blind-check agreement     | 87.6%             | 80.6%                            |
| Reconciled / in review    | 24 / 0            | 38 / 0                           |

Paired on the 194 answers scored in both runs: exact 45.9% to 52.1%, within-1 96.9% to 95.4%. Total marks 420 to 405 (tutor 407 of 673). 43 marks changed (29 down by 1, 14 up by 1); 26 moved closer to the tutor's mark and 17 further. Signed error by tutor mark (1415 to 1417): 0: +0.77 to +0.73; 1: +0.57 to +0.39; 2: +0.06 to +0.02; 3: -0.29 to -0.31; 4: -0.79 to -0.79; 5: -0.75 to -1.00; 6: -1.00 to -1.00. Zero marks: all 7 Airo zeros match a tutor 0 (6 before); 19 of 26 tutor-0 answers still get 1. Both answers that failed the format check in 1415 were marked correctly.

### Cost

A1 check $1.76 (73 calls, $0.088 per item including judge). Held-out $11.55 (488 calls, $0.0589 per answer, 22.3 s per answer). OpenRouter eval-cap total moved from $20.09 to $32.55; the judge model has no `openai/` prefix, so its spend is outside that total.

### Known shortfalls

- Comments are not shorter: median comment body 87 characters in 1415, 98 in 1414.
- No "you are writing too much" advice appears on the over-long short answers the tutor flagged.
- Judge scores fell on ge-4 (4 to 3) and ge-5 (6 to 4).
- Slightly harsher on strong answers: signed error for tutor-5 answers moved from -0.75 to -1.00.
- Marks can still shift with comment wording because comments share the first-pass call.
