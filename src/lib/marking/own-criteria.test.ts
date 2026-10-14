import { expect, it } from "vitest";
import type { OwnQuestion } from "@/lib/single-check";
import { assessOwnCriteria } from "./own-criteria";

const question: OwnQuestion = {
  stem: "Explain the causes of inflation.",
  marks: 6,
  verb: "explain",
  topic_id: null,
  criteria_text: null,
};
const descriptor = "Explains causes with relevant evidence";
it.each([null, "", "   \n"])("rejects missing criteria %s", (criteria_text) => {
  expect(assessOwnCriteria({ ...question, criteria_text })).toMatchObject({
    ok: false,
    reason: "missing",
  });
});
it.each(["A good answer earns full marks.", "1–6: Good answer", "1–6:"])(
  "rejects vague criteria %s",
  (criteria_text) => {
    expect(assessOwnCriteria({ ...question, criteria_text })).toMatchObject({
      ok: false,
      reason: "vague",
    });
  },
);
it.each([
  `1–2: ${descriptor}\n4–6: ${descriptor}`, // gap
  `1–3: ${descriptor}\n3–6: ${descriptor}`, // overlap
  `1–5: ${descriptor}`, // wrong top
  `1–7: ${descriptor}`, // exceeds marks
  `6–1: ${descriptor}`, // reversed range
  `0: ${descriptor}\n0: ${descriptor}\n1–6: ${descriptor}`, // overlapping zero bands
])("rejects inconsistent bands %s", (criteria_text) => {
  expect(assessOwnCriteria({ ...question, criteria_text })).toEqual({
    ok: false,
    reason: "inconsistent",
    message:
      "We can't mark this reliably: your marking criteria don't add up to 6 marks.",
  });
});
it("accepts descending bands with en dashes and optional marks labels", () => {
  expect(
    assessOwnCriteria({
      ...question,
      criteria_text: `5-6 marks: Thoroughly ${descriptor}\n3–4: Clearly ${descriptor}\n1–2: Partially ${descriptor}`,
    }),
  ).toEqual({
    ok: true,
    restrictions: "",
    criteria: [
      { min: 5, max: 6, descriptor: `Thoroughly ${descriptor}` },
      { min: 3, max: 4, descriptor: `Clearly ${descriptor}` },
      { min: 1, max: 2, descriptor: `Partially ${descriptor}` },
    ],
  });
});
it("accepts single-mark lines without Band prefixes", () => {
  expect(
    assessOwnCriteria({
      ...question,
      marks: 3,
      criteria_text: `3 marks - Fully ${descriptor}\n2 marks: Clearly ${descriptor}\n1 mark: Partially ${descriptor}`,
    }),
  ).toEqual({
    ok: true,
    restrictions: "",
    criteria: [3, 2, 1].map((mark, i) => ({
      min: mark,
      max: mark,
      descriptor: `${["Fully", "Clearly", "Partially"][i]} ${descriptor}`,
    })),
  });
});
it("accepts an optional zero band", () => {
  expect(
    assessOwnCriteria({
      ...question,
      criteria_text: `0 marks: No relevant information is provided\n1–6: ${descriptor}`,
    }),
  ).toMatchObject({ ok: true });
});

it("preserves non-band restrictions", () => {
  expect(
    assessOwnCriteria({
      ...question,
      criteria_text: `1–6: ${descriptor}\nWithout both mechanisms, cap at 2`,
    }),
  ).toMatchObject({
    ok: true,
    restrictions: "Without both mechanisms, cap at 2",
  });
});
it.each([
  "3 marks maximum if only one mechanism is explained",
  "1 mark maximum if no mechanism is explained",
  "3 marks capped if only one mechanism is explained",
  "3 marks at most if only one mechanism is explained",
])("preserves digit-leading caps as restrictions: %s", (restriction) => {
  expect(
    assessOwnCriteria({
      ...question,
      criteria_text: `1–6: ${descriptor}\n${restriction}\nWithout evidence, cap at 2`,
    }),
  ).toEqual({
    ok: true,
    criteria: [{ min: 1, max: 6, descriptor }],
    restrictions: `${restriction}\nWithout evidence, cap at 2`,
  });
});
it.each([
  "Band seven: Explains causes with evidence",
  "7–8 missing delimiter",
  "7–x: Explains causes with evidence",
  "-1: Explains causes with evidence",
  "1.5–2: Explains causes with evidence",
  "3 marks missing delimiter",
  "3–x marks maximum if only one mechanism is explained",
  "-3 marks maximum if only one mechanism is explained",
])("rejects malformed extra band %s", (line) => {
  expect(
    assessOwnCriteria({
      ...question,
      criteria_text: `1–6: ${descriptor}\n${line}`,
    }),
  ).toMatchObject({ ok: false, reason: "inconsistent" });
});
it.each([descriptor, "EXPLAINS   causes with relevant evidence."])(
  "rejects ambiguous duplicate descriptors %s",
  (duplicate) => {
    expect(
      assessOwnCriteria({
        ...question,
        criteria_text: `1–2: ${descriptor}\n3–6: ${duplicate}`,
      }),
    ).toMatchObject({
      ok: false,
      reason: "inconsistent",
      message: expect.stringContaining("distinct description"),
    });
  },
);
