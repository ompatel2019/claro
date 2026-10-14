// @vitest-environment node
import { expect, it } from "vitest";
import { prepareA1Snapshot } from "./a1-snapshot";
import questionsJson from "./a1-mock-questions.json";
import type { MarkableQuestion } from "@/lib/marking/grade";

const questions = questionsJson as MarkableQuestion[];
const question = questions[0];
const input = Array.from({ length: 9 }, (_, i) => ({
  question: question.id,
  source_hash: i.toString(16).padStart(32, "0"),
  answer_text: `Anonymous answer ${i}`,
  tutor_mark: i % (question.marks + 1),
  accepted_tutor_comments: [],
  rejected_ai_comments: [],
}));
const prepare = (rows: unknown, benchmark: string[] = []) =>
  prepareA1Snapshot(rows, questions, benchmark);

it("extends the mock bank with separate human-marked tests and calibration examples", () => {
  const before = structuredClone(input);
  const rows = prepare(input);
  expect(input).toEqual(before);
  expect(rows.filter((r) => r.split === "test")).toHaveLength(3);
  expect(rows.filter((r) => r.split === "example")).toHaveLength(6);
  expect(rows.every((r) => r.question_id === `a1-${question.id}`)).toBe(true);
  expect(rows.every((r) => r.origin === "a1")).toBe(true);
  expect(
    prepare([...input].reverse()).sort((a, b) =>
      a.source_hash.localeCompare(b.source_hash),
    ),
  ).toEqual(rows);
});

it.each([
  [{ ...input[0], question: "unknown" }, /Unknown question/],
  [{ ...input[0], tutor_mark: question.marks + 1 }, /exceeds maximum/],
  [{ ...input[0], tutor_mark: -1 }, /too_small/],
  [{ ...input[0], tutor_mark: NaN }, /invalid_type/],
  [{ ...input[0], tutor_mark: "2" }, /invalid_type/],
  [{ ...input[0], answer_text: " \n " }, /too_small/],
  [{ ...input[0], source_hash: "submission-id" }, /invalid_format/],
])("rejects invalid snapshots before import: %j", (row, error) => {
  expect(() => prepare([row])).toThrow(error);
});

it("rejects duplicate hashes, repeated scripts and normalised benchmark leakage", () => {
  expect(() =>
    prepare([input[0], { ...input[1], source_hash: input[0].source_hash }]),
  ).toThrow("Duplicate source hash");
  expect(() =>
    prepare([input[0], { ...input[1], answer_text: " ANONYMOUS\nanswer 0 " }]),
  ).toThrow("Duplicate or benchmark answer");
  expect(() => prepare(input, ["ANONYMOUS\nanswer 0"])).toThrow(
    "Duplicate or benchmark answer",
  );
  expect(() => prepare([])).toThrow();
});

it("keeps fractional human marks in calibration only, with zero having no band", () => {
  const rows = prepare([{ ...input[0], tutor_mark: 0.5 }, ...input.slice(1)]);
  expect(rows[0].split).toBe("example");
  expect(prepare([input[0]])[0].band).toBeNull();
});
