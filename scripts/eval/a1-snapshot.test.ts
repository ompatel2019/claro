// @vitest-environment node
import { expect, it } from "vitest";
import { prepareA1Snapshot } from "./a1-snapshot";
import questionsJson from "@/lib/ai/eval/a1-mock-questions.json";
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
  [{ ...input[0], tutor_mark: 0.5 }, /invalid_type/],
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

it("keeps zero marks with no band", () => {
  expect(prepare([input[0]])[0].band).toBeNull();
});

it("redacts all comment prose without mutating the snapshot", () => {
  const identifyingText =
    "Priya Sharma, li, 李明, priya@example.com, student S-123 and 550e8400-e29b-41d4-a716-446655440000";
  const snapshot = [
    {
      ...input[0],
      accepted_tutor_comments: [
        {
          author: "tutor",
          kind: "note",
          quote: identifyingText,
          body: identifyingText,
        },
        {
          author: "ai",
          kind: "strength",
          quote: "",
          body: "Clear explanation.",
        },
      ],
      rejected_ai_comments: [
        { kind: "improvement", quote: identifyingText, body: identifyingText },
        { kind: null, quote: "", body: "More detail." },
      ],
    },
  ];
  const before = structuredClone(snapshot);
  const [row] = prepare(snapshot);
  expect(row.accepted_tutor_comments).toEqual([
    { author: "tutor", kind: "note", quote: "[redacted]", body: "[redacted]" },
    { author: "ai", kind: "strength", quote: "[redacted]", body: "[redacted]" },
  ]);
  expect(row.rejected_ai_comments).toEqual([
    { kind: "improvement", quote: "[redacted]", body: "[redacted]" },
    { kind: null, quote: "[redacted]", body: "[redacted]" },
  ]);
  expect(snapshot).toEqual(before);
});

it.each(["accepted_tutor_comments", "rejected_ai_comments"])(
  "rejects malformed or identifying metadata in %s",
  (field) => {
    const comment = {
      ...(field === "accepted_tutor_comments" ? { author: "tutor" } : {}),
      kind: "strength",
      quote: "",
      body: "Clear explanation.",
    };
    for (const invalid of [
      null,
      "Priya Sharma",
      [],
      {},
      { ...comment, kind: "Priya Sharma" },
      { ...comment, author: "priya@example.com" },
      { ...comment, student_id: "S-123" },
      { ...comment, quote: { name: "Priya Sharma" } },
      { ...comment, body: ["priya@example.com"] },
      { ...comment, body: undefined },
    ]) {
      expect(() => prepare([{ ...input[0], [field]: [invalid] }])).toThrow();
    }
    expect(() => prepare([{ ...input[0], [field]: comment }])).toThrow();
  },
);

it("requires an accepted comment author from the export's fixed metadata", () => {
  expect(() =>
    prepare([
      {
        ...input[0],
        accepted_tutor_comments: [
          { kind: "note", quote: "", body: "Feedback" },
        ],
      },
    ]),
  ).toThrow();
});
