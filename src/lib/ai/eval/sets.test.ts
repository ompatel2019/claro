// @vitest-environment node
import { expect, it } from "vitest";
import {
  evalSets,
  evalRows,
  retrievalExclusions,
  retrievalPool,
  validateSets,
} from "./sets";

it("loads sorted, unique, disjoint frozen sets of 300 and 310 ids", () => {
  expect(evalSets.dev).toHaveLength(300);
  expect(evalSets.final).toHaveLength(310);
  expect(() => validateSets(evalSets.dev, evalSets.final)).not.toThrow();
});

it("rejects incorrect sizes, duplicate ids, unsorted ids and overlap", () => {
  expect(() => validateSets([], evalSets.final)).toThrow(
    "300 dev and 310 final",
  );
  expect(() =>
    validateSets(Array(300).fill("duplicate"), evalSets.final),
  ).toThrow("unique");
  expect(() =>
    validateSets([...evalSets.dev].reverse(), evalSets.final),
  ).toThrow("sorted");
  const overlapping = [...evalSets.final.slice(1), evalSets.dev[0]].sort();
  expect(() => validateSets(evalSets.dev, overlapping)).toThrow("overlap");
});

const row = (id: string, split = "example") => ({
  id,
  question_id: "fixture-question",
  split,
  answer_text: "Mock answer",
});

it.each(["dev", "final"] as const)(
  "selects the complete %s set in frozen order and retains row fields",
  (set) => {
    const rows = evalSets[set].map((id) => row(id));
    expect(evalRows([...rows].reverse().concat(row("extra")), set)).toEqual(
      rows,
    );
    expect(() => evalRows(rows.slice(1), set)).toThrow("Missing frozen");
  },
);

it("leaves the current dev answer out while retaining other dev answers", () => {
  const self = evalSets.dev[0];
  const other = row(evalSets.dev[1]);
  expect(
    retrievalPool(
      [row(self), other, row(evalSets.final[0]), row("test", "test")],
      "dev",
      self,
    ),
  ).toEqual([other]);
  expect(retrievalExclusions("dev", self)).toContain(self);
});

it.each([undefined, "dev", "final"] as const)(
  "excludes every final row from retrieval in mode %s",
  (set) => {
    const rows = evalSets.final.map((id) => row(id));
    const example = row("ordinary-example");
    expect(
      retrievalPool(
        [...rows, example, row("test", "test")],
        set,
        evalSets.dev[0],
      ),
    ).toEqual([example]);
    expect(retrievalExclusions(set, evalSets.dev[0])).toEqual(
      set === "dev" ? [...evalSets.final, evalSets.dev[0]] : evalSets.final,
    );
  },
);
