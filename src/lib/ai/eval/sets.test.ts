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

it("excludes all dev answers instead of leaving only the current answer out", () => {
  const answer = row(evalSets.dev[0]);
  const eligible = { ...row("eligible"), answer_text: "Different answer" };
  expect(
    retrievalPool(
      [answer, row(evalSets.dev[1]), row(evalSets.final[0]), eligible],
      "dev",
      answer,
    ),
  ).toEqual([eligible]);
  expect(retrievalExclusions("dev", answer.id)).toContain(evalSets.dev[1]);
});

it.each([undefined, "dev", "final"] as const)(
  "excludes every dev/final row and matching answer identity/text in mode %s",
  (set) => {
    const answer = { ...row("self"), source_hash: "same-hash" };
    const eligible = {
      ...row("ordinary-example"),
      answer_text: "Different answer",
    };
    const rows = [
      ...[...evalSets.dev, ...evalSets.final].map((id) => row(id)),
      answer,
      { ...row("text-duplicate"), answer_text: "  ＭＯＣＫ\nANSWER  " },
      {
        ...row("hash-duplicate"),
        answer_text: "Different text",
        source_hash: answer.source_hash,
      },
      eligible,
      row("test", "test"),
    ];
    expect(retrievalPool(rows, set, answer)).toEqual([eligible]);
    expect(retrievalExclusions(set)).toEqual([
      ...evalSets.dev,
      ...evalSets.final,
    ]);
  },
);
