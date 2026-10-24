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
        marking: true,
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

it("counts answers the background queue marked, only at the marked version", async () => {
  const { markedNow } = await import("./marking-sheet");
  const rows = [
    { ...a("1", "short"), v: "one" },
    { ...a("2", "short"), v: "one" },
    { ...a("3", "short"), v: "edited" },
    { ...a("4", "mcq", "marked"), v: "" },
  ];
  const live = markedNow(
    rows,
    new Map([
      ["2", "one"],
      ["3", "one"],
    ]),
    (r) => r.v,
  );
  expect(live.map((r) => r.status)).toEqual([
    "pending",
    "marked",
    "pending",
    "marked",
  ]);
  expect(live[0]).toBe(rows[0]);
  expect(markingSheet(live).marked).toBe(2);
});

it("shows early marks the server already saved or started, which this tab never saw", async () => {
  const { markedNow, withServerStatus } = await import("./marking-sheet");
  // Q1 to Q8 were marked early on the server; the tab's own queue saw none settle.
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => a(`w${i + 1}`, "short")),
    a("w9", "short"),
    a("w10", "short"),
    a("m1", "mcq"),
  ];
  const local = markedNow(rows, new Map(), () => "");
  expect(markingSheet(local).marked).toBe(0);
  const server = new Map<string, string>([
    ...Array.from({ length: 8 }, (_, i) => [`w${i + 1}`, "marked"] as const),
    ["w9", "marking"],
    ["w10", "pending"],
    ["m1", "pending"],
  ]);
  const sheet = markingSheet(withServerStatus(local, server));
  expect(sheet.marked).toBe(8);
  const byLabel = Object.fromEntries(sheet.rows.map((r) => [r.label, r]));
  expect(byLabel.Q8).toMatchObject({ marked: 1, total: 1 });
  expect(byLabel.Q9).toMatchObject({ marked: 0, marking: true });
  expect(byLabel.Q10).toMatchObject({ marked: 0 });
  expect(byLabel.Q10.marking).toBeUndefined();
  // A server row never un-marks what this tab already knows is marked.
  const kept = withServerStatus(
    [a("x", "short", "marked")],
    new Map([["x", "pending"]]),
  );
  expect(kept[0].status).toBe("marked");
});
