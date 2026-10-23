import { expect, it } from "vitest";
import {
  ANSWER_LEGEND,
  ANSWER_PILL_SELECTED,
  ANSWER_PILL_TONE,
  answerPillState,
} from "./answer-pill";

it.each([
  [{ mark: 2, max: 2 }, "full"],
  [{ mark: 3, max: 2 }, "full"],
  [{ mark: 3, max: 4 }, "part"],
  [{ mark: 0.5, max: 1 }, "part"],
  [{ mark: 0, max: 1 }, "none"],
  [{ mark: 0, max: 0 }, "none"],
  [{ mark: null, max: 2 }, "pending"],
  [{ mark: 1, max: 2, scored: false }, "pending"],
  [{ mark: 0, max: 2, answered: false }, "not_answered"],
] as const)("maps %j to %s", (input, state) => {
  expect(answerPillState(input)).toBe(state);
});

it("uses the sprint tracker states and never uses a dark ring when selected", () => {
  expect(ANSWER_PILL_TONE.full).toBe("bg-brand text-brand-foreground");
  expect(ANSWER_PILL_TONE.part).toBe("bg-brand-soft text-brand-text");
  expect(ANSWER_PILL_TONE.none).toBe("bg-muted text-muted-foreground");
  expect(ANSWER_PILL_TONE.not_answered).toMatch(/border-dashed/);
  expect(ANSWER_PILL_SELECTED).not.toMatch(/ring/);
  for (const [, dot] of ANSWER_LEGEND) expect(dot).toMatch(/border/);
});
