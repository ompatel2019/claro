import { expect, it } from "vitest";
import { RESULT_LEGEND, RESULT_TILE, answerPillState } from "./answer-pill";

it.each([
  [{ mark: 2, max: 2 }, "full"],
  [{ mark: 3, max: 2 }, "full"],
  [{ mark: 3, max: 4 }, "dropped"],
  [{ mark: 0, max: 1 }, "dropped"],
  [{ mark: 0, max: 0 }, "dropped"],
  [{ mark: null, max: 2 }, "pending"],
  [{ mark: 1, max: 2, scored: false }, "pending"],
  [{ mark: 0, max: 2, answered: false }, "not_answered"],
] as const)("maps %j to %s", (input, state) => {
  expect(answerPillState(input)).toBe(state);
});

it("uses the tracker states plus result-only full and dropped tones, with no rings", () => {
  expect(RESULT_TILE.open).toBe("bg-brand-soft text-brand-text");
  expect(RESULT_TILE.not_answered).toBe("bg-muted text-muted-foreground");
  expect(RESULT_TILE.full).toBe("bg-brand text-navy-deep");
  expect(RESULT_TILE.dropped).toBe("bg-destructive-soft text-destructive-text");
  for (const tone of Object.values(RESULT_TILE))
    expect(tone).not.toMatch(/ring/);
  expect(RESULT_LEGEND.map(([label]) => label)).toEqual([
    "Open now",
    "Full marks",
    "Marks dropped",
    "Not answered",
  ]);
  for (const [, dot] of RESULT_LEGEND) expect(dot).toMatch(/border/);
});
