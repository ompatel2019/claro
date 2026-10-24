import { expect, it } from "vitest";
import { markingSheet } from "./marking-sheet";

const a = (
  id: string,
  type: "mcq" | "short" | "extended",
  status = "pending",
  max_marks: number | null = null,
  marks = 1,
) => ({ id, status, max_marks, question: { type, marks } });

it("groups multiple choice and lists each written answer with real counts", () => {
  const sheet = markingSheet([
    a("1", "mcq", "marked"),
    a("2", "mcq"),
    a("3", "short", "marked", 4),
    a("4", "extended", "marking", null, 6),
  ]);
  expect(sheet).toEqual({
    marked: 2,
    total: 4,
    rows: [
      {
        key: "mcq",
        label: "Multiple choice · Q1 to Q2",
        detail: "2 questions",
        marked: 1,
        total: 2,
      },
      {
        key: "3",
        label: "Q3",
        detail: "Written answer · 4 marks",
        marked: 1,
        total: 1,
      },
      {
        key: "4",
        label: "Q4",
        detail: "Written answer · 6 marks",
        marked: 0,
        total: 1,
      },
    ],
  });
});

it("handles a single question and a sprint with no multiple choice", () => {
  expect(markingSheet([a("x", "mcq")]).rows[0]).toMatchObject({
    label: "Multiple choice · Q1",
    detail: "1 question",
  });
  const short = markingSheet([a("y", "short", "pending", 1)]);
  expect(short.rows).toHaveLength(1);
  expect(short.rows[0].detail).toBe("Written answer · 1 mark");
  expect(markingSheet([])).toEqual({ rows: [], marked: 0, total: 0 });
});
