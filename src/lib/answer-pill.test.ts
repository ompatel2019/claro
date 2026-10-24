import { expect, it } from "vitest";
import {
  RESULT_LEGEND,
  RESULT_OPEN,
  RESULT_SWATCH,
  RESULT_TILE,
  RESULT_WORD,
  answerPillState,
} from "./answer-pill";

it.each([
  [{ mark: 2, max: 2 }, "full"],
  [{ mark: 3, max: 2 }, "full"],
  [{ mark: 3, max: 4 }, "part"],
  [{ mark: 0.5, max: 1 }, "part"],
  [{ mark: 0, max: 1 }, "zero"],
  [{ mark: 0, max: 0 }, "zero"],
  [{ mark: null, max: 2 }, "pending"],
  [{ mark: 1, max: 2, scored: false }, "pending"],
  [{ mark: 0, max: 2, answered: false }, "not_answered"],
] as const)("maps %j to %s", (input, state) => {
  expect(answerPillState(input)).toBe(state);
});

it("colours by mark: soft green full, amber part, red zero, grey not answered", () => {
  expect(RESULT_TILE.full).toBe("bg-success-soft text-success-text");
  expect(RESULT_TILE.part).toBe("bg-warning-soft text-warning-text");
  expect(RESULT_TILE.zero).toBe("bg-destructive-soft text-destructive-text");
  expect(RESULT_TILE.not_answered).toBe("bg-foreground/25 text-foreground");
  // No loud fills: every tile is a soft tint, and the open one is an outline only.
  for (const tone of Object.values(RESULT_TILE)) {
    expect(tone).not.toMatch(
      /ring|bg-(brand|success|warning|destructive)(\s|$)/,
    );
  }
  expect(RESULT_OPEN).toBe("border-current");
});

it("keeps the key in step with the pills", () => {
  expect(RESULT_LEGEND.map(([label]) => label)).toEqual([
    "Full marks",
    "Part marks",
    "No marks",
    "Not answered",
    "Open now",
  ]);
  for (const [label, state] of RESULT_LEGEND) {
    if (state === "open") continue;
    expect(RESULT_SWATCH[state]).toBe(RESULT_TILE[state]);
    expect(RESULT_WORD[state]).toBe(label);
  }
});

it("takes the grey tiles from the shared tracker map", async () => {
  const { TRACKER_STATE } = await import("@/components/sprint/tracker-state");
  expect(RESULT_TILE.not_answered).toBe(TRACKER_STATE.unanswered);
  expect(RESULT_TILE.pending).toBe(TRACKER_STATE.unanswered);
});

it("keeps terminal unscored results apart from ones still being marked", () => {
  expect(answerPillState({ mark: null, max: 4, scored: false })).toBe(
    "pending",
  );
  expect(
    answerPillState({ mark: null, max: 4, scored: false, marking: false }),
  ).toBe("unmarked");
});
