// @vitest-environment node
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import questions from "../ai/eval/a1-mock-questions.json";
import data from "./checklists.json";
import { checklists, ChecklistsSchema } from "./checklists";

const refs = [
  "m2-21a",
  "m2-22a",
  "m2-23c",
  "m3-21b",
  "m3-22b",
  "m3-23a",
  "m3-23c",
  "m3-24a",
  "m4-21a",
  "m4-22c",
  "m4-23c",
  "m4-24a",
];

it("validates the data at load and covers exactly the 12 real imported question IDs", () => {
  expect(ChecklistsSchema.parse(data)).toEqual(checklists);
  expect(Object.keys(checklists).sort()).toEqual(
    refs.map((ref) => `a1-${ref}`).sort(),
  );
  for (const id of Object.keys(checklists)) {
    const question = questions.find((q) => `a1-${q.id}` === id);
    expect(question, id).toBeDefined();
    expect(question!.type).toBe("short");
  }
});

it("rejects malformed entries, duplicate check IDs and invalid question IDs", () => {
  const entry = data["a1-m2-21a"][0];
  for (const invalid of [
    { ...entry, id: "" },
    { ...entry, check: "Not a question" },
    { ...entry, evidence: "" },
    { ...entry, effect: "" },
    { ...entry, extra: "unexpected" },
  ])
    expect(ChecklistsSchema.safeParse({ "a1-m2-21a": [invalid] }).success).toBe(
      false,
    );
  expect(ChecklistsSchema.safeParse({ "a1-m2-21a": [] }).success).toBe(false);
  expect(
    ChecklistsSchema.safeParse({ "a1-m2-21a": [entry, entry] }).success,
  ).toBe(false);
  expect(ChecklistsSchema.safeParse({ "m2-21a": [entry] }).success).toBe(false);
});

it("requires both flow categories for 4+ and a reason for TWI accuracy for 2+", () => {
  const flows = checklists["a1-m4-22c"];
  for (const id of ["trade-flows", "financial-flows"]) {
    expect(flows.find((item) => item.id === id)!.effect).toContain(
      "caps at 3 if no",
    );
  }
  expect(
    checklists["a1-m3-22b"].find((item) => item.id === "why-more-accurate")!
      .effect,
  ).toContain("caps at 1 if no");
});

it("uses the official structural/cyclical distinction despite the inverted tutor note", () => {
  const concept = checklists["a1-m4-24a"][0].evidence;
  expect(concept).toContain("discretionary government");
  expect(concept).toContain("automatic changes caused by the business cycle");
});

it("requires a protection mechanism beyond naming an export incentive", () => {
  const checks = checklists["a1-m3-21b"];
  expect(
    checks.find((item) => item.id === "protective-advantage")!.effect,
  ).toContain("caps at 1 if no");
  expect(
    checks.find((item) => item.id === "protection-mechanism")!.effect,
  ).toContain("caps at 2 if no");
});

it("has no checklist key missing from the real question-ID import migration", () => {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/0000_baseline.sql", import.meta.url),
    "utf8",
  );
  // Match only the id column of inserted question rows (baseline data INSERTs), not origin_ref or prose.
  const ids = new Set(
    [
      ...sql.matchAll(
        /^INSERT INTO public\.questions \([^)]*\) VALUES \('(a1-m\d+-\d{2}[a-z])', 'short',/gm,
      ),
    ].map((match) => match[1]),
  );
  expect(ids.size).toBe(41);
  const missing = Object.keys(checklists).filter((id) => !ids.has(id));
  expect(
    missing,
    "Checklist IDs absent from the baseline's A1 question rows (0022)",
  ).toEqual([]);
});
