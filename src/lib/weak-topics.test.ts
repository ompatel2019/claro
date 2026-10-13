import { expect, it } from "vitest";
import { hasTopicHistory, isWeakTopic, weakTopicUnlock } from "./weak-topics";
it.each([
  [0, 0, false],
  [2, 2, false],
  [3, 1, false],
  [3, 2, true],
  [20, 1, false],
  [4, 3, true],
  [Infinity, 2, false],
  [3, Infinity, false],
  [NaN, 2, false],
  [3.5, 2, false],
  [3, -1, false],
])(
  "requires both sample boundaries (%s answers, %s sessions)",
  (answered, sessions, eligible) => {
    expect(
      hasTopicHistory({
        answered: Number(answered),
        sessions: Number(sessions),
      }),
    ).toBe(eligible);
  },
);
it("fails closed for missing sessions and invalid scores, includes only below 60%", () => {
  expect(hasTopicHistory({ answered: 10 })).toBe(false);
  for (const pct of [null, NaN, Infinity, -1, 60, 100])
    expect(isWeakTopic({ answered: 3, sessions: 2, pct })).toBe(false);
  expect(isWeakTopic({ answered: 3, sessions: 2, pct: 59.9 })).toBe(true);
});
it("explains remaining answers and the second-session requirement", () => {
  const t = { name: "Synthetic topic", answered: 2, sessions: 1, pct: 20 };
  expect(weakTopicUnlock(t)).toContain("1 more question");
  expect(weakTopicUnlock({ ...t, answered: 3 })).toContain("another session");
  expect(weakTopicUnlock({ ...t, answered: 3, sessions: 2 })).toBeNull();
});
