// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  splitSentences,
  tightenComments,
  tightenSummary,
  tightenText,
} from "./comment-voice";
import { anchorComments } from "./grade";

const body = (text: string, strength = false) =>
  tightenText(text, { maxSentences: 2, strength });

describe("splitSentences", () => {
  it("keeps decimals, money, e.g. and lower-case continuations intact", () => {
    expect(
      splitSentences(
        "Use it: 840 ÷ 105 × 100 = $800m. Then link it, e.g. to GDP growth of 2.5%. Done.",
      ),
    ).toEqual([
      "Use it: 840 ÷ 105 × 100 = $800m.",
      "Then link it, e.g. to GDP growth of 2.5%.",
      "Done.",
    ]);
  });
  it("keeps closing quotes with their sentence and handles ! and ?", () => {
    expect(splitSentences('Say "whereas." Why? Fix it!')).toEqual([
      'Say "whereas."',
      "Why?",
      "Fix it!",
    ]);
  });
  it("returns text without a full stop as one sentence", () => {
    expect(splitSentences("Correct formula, it deflates nominal GDP")).toEqual([
      "Correct formula, it deflates nominal GDP",
    ]);
  });
});

describe("tightenText", () => {
  it("leaves already-direct comments byte-identical", () => {
    for (const text of [
      "You asked for data the stimulus already gives. Use it: 840 ÷ 105 × 100 = $800m.",
      "Correct formula, it deflates nominal GDP.",
      'Two separate definitions, no contrast. Put both in one sentence with "whereas".',
    ])
      expect(body(text)).toBe(text);
  });

  it("caps bodies at two sentences and next_mark at one", () => {
    expect(body("One. Two. Three.")).toBe("One. Two.");
    expect(
      tightenText("Add the link. Then a judgement.", { maxSentences: 1 }),
    ).toBe("Add the link.");
  });

  it("strips banned openers and recapitalises", () => {
    expect(body("Overall, you link costs to prices.")).toBe(
      "You link costs to prices.",
    );
    expect(body("It is important to note that the CAD is a flow.")).toBe(
      "The CAD is a flow.",
    );
    expect(body("Well done, you define GDP precisely.")).toBe(
      "You define GDP precisely.",
    );
    expect(body("Great job! You name the policy.")).toBe(
      "You name the policy.",
    );
    expect(body("In this answer, your definition is circular.")).toBe(
      "Your definition is circular.",
    );
    expect(body("Try to name the multiplier.")).toBe("Name the multiplier.");
    expect(body("You could also add a contrast word.")).toBe(
      "Add a contrast word.",
    );
    expect(body("You might want to explain the lag.")).toBe("Explain the lag.");
  });

  it("turns 'consider <verb>ing' into an imperative for known verbs only", () => {
    expect(body("Consider adding a contrast with whereas.")).toBe(
      "Add a contrast with whereas.",
    );
    expect(body("You could consider linking it to exports.")).toBe(
      "Link it to exports.",
    );
    // Unknown verb: left alone rather than guessed.
    expect(body("Consider reframing the opening.")).toBe(
      "Consider reframing the opening.",
    );
  });

  it("rewrites hedges to the direct form", () => {
    expect(body("The link could be made more explicit.")).toBe(
      "The link needs to be explicit.",
    );
    expect(body("Your definition could be clearer.")).toBe(
      "Your definition needs to be clearer.",
    );
    expect(body("This paragraph would benefit from a mechanism.")).toBe(
      "This paragraph needs a mechanism.",
    );
    expect(body("Perhaps add the lag.")).toBe("Add the lag.");
    // Economic actors and outcomes are never rewritten (codex review).
    for (const text of [
      "Explain why exporters would benefit from a depreciation.",
      "Explain why demand could be stronger after the tax cut.",
      "Say why the policy could be made more explicit to markets.",
    ])
      expect(body(text)).toBe(text);
  });

  it("keeps substantive content and economic qualifiers (codex review)", () => {
    expect(
      body(
        "Your definition is wrong. Note that inflation is a rise in the general price level.",
      ),
    ).toBe(
      "Your definition is wrong. Inflation is a rise in the general price level.",
    );
    expect(
      body(
        "Good work explaining how higher costs raise prices. Adding the transmission mechanism would strengthen it.",
        true,
      ),
    ).toBe("Good work explaining how higher costs raise prices.");
    expect(body("Well done linking costs to prices.")).toBe(
      "Well done linking costs to prices.",
    );
    for (const text of [
      "Explain why demand is only slightly elastic.",
      "Prices rose a little, so say inflation stayed in the band.",
      "The effect is possibly offset by a lower dollar, so name both.",
      "Your claim is arguably true, but give the mechanism.",
    ])
      expect(body(text)).toBe(text);
  });

  it("drops meta sentences and praise padding", () => {
    expect(
      body(
        "This summary covers your written short answers; multiple-choice answers were not supplied. You define inflation precisely.",
      ),
    ).toBe("You define inflation precisely.");
    expect(body("Good work. You explain the lag.")).toBe(
      "You explain the lag.",
    );
    expect(
      tightenText(
        "Already at full marks; a clearer sentence would strengthen the link without changing the mark.",
        { maxSentences: 1 },
      ),
    ).toBe(
      "Already at full marks; a clearer sentence would strengthen the link without changing the mark.",
    );
    expect(
      tightenText(
        "Already at full marks; correct 'economics' to 'economies'.",
        {
          maxSentences: 1,
        },
      ),
    ).toBe("Correct 'economics' to 'economies'.");
  });

  it("drops 'no mark change' meta sentences when something else remains", () => {
    expect(
      body("Tighten the opening. It would only save time, not add a mark."),
    ).toBe("Tighten the opening.");
    expect(body("This will not change your mark.")).toBe(
      "This will not change your mark.",
    );
  });

  it("keeps diagnoses and advice next to meta clauses (codex review)", () => {
    expect(body("You may be confusing inflation with deflation.")).toBe(
      "You may be confusing inflation with deflation.",
    );
    expect(body("You might need a second example.")).toBe(
      "You might need a second example.",
    );
    expect(
      body(
        "This will not earn another mark; explain how higher rates reduce borrowing. Name the transmission mechanism.",
      ),
    ).toBe(
      "Explain how higher rates reduce borrowing. Name the transmission mechanism.",
    );
    expect(
      body(
        "Your definition is accurate. This wording will not earn another mark, so explain how higher rates reduce borrowing.",
      ),
    ).toBe(
      "Your definition is accurate. Explain how higher rates reduce borrowing.",
    );
    expect(
      body(
        "This will not change your mark, but name the lag. Then add a result.",
      ),
    ).toBe("Name the lag. Then add a result.");
    // Advice whose own subject is not the comment is kept whole (codex review).
    for (const text of [
      "Your definition is accurate. Do not add a statistic because it will not earn another mark.",
      "Your definition is accurate. Repeating it will not earn another mark, so explain how higher rates reduce borrowing.",
    ])
      expect(body(text)).toBe(text);
    expect(body("Explain the lag; this will not change your mark.")).toBe(
      "Explain the lag.",
    );
  });

  it("drops a hedged improvement tacked onto a strength, but only on strengths", () => {
    const text =
      "You trace the cost-push chain clearly. Adding why oil matters would deepen it.";
    expect(body(text, true)).toBe("You trace the cost-push chain clearly.");
    expect(body(text, false)).toBe(text);
    expect(
      body(
        "You correctly identify government support for exporters. Naming subsidies or tax concessions would make it more precise.",
        true,
      ),
    ).toBe("You correctly identify government support for exporters.");
    // An economic outcome is content, not padding (codex review).
    const economic =
      "You correctly identify expansionary fiscal policy. Higher government spending would strengthen aggregate demand.";
    expect(body(economic, true)).toBe(economic);
  });

  it("keeps the original when filtering would empty it", () => {
    expect(body("Well done!")).toBe("Well done!");
    expect(body("This feedback only covers written answers.")).toBe(
      "This feedback only covers written answers.",
    );
    expect(body("")).toBe("");
    expect(body("   ")).toBe("   ");
  });

  it("is idempotent", () => {
    for (const text of [
      "Overall, consider adding a link. It could be made more explicit. Third.",
      "Great job! Try to name it.",
    ]) {
      const once = body(text);
      expect(body(once)).toBe(once);
    }
  });
});

describe("tightenComments", () => {
  const answer = "Inflation rose because costs rose, so firms raised prices.";
  const raw = [
    {
      quote: "costs rose",
      kind: "strength" as const,
      tag: "Analysis" as const,
      body: "Overall, you link costs to prices. Naming the input would sharpen it. Third.",
      next_mark: null,
    },
    {
      quote: "so firms raised prices",
      kind: "fix" as const,
      tag: "Knowledge" as const,
      body: "Consider adding the mechanism. It could be made more explicit. Extra.",
      next_mark: "Explain the margin squeeze. Then add a result.",
    },
  ];

  it("changes only body and next_mark, never quote, start, kind, tag or order", () => {
    const anchored = anchorComments(answer, raw);
    const out = tightenComments(anchored);
    expect(out).toHaveLength(anchored.length);
    out.forEach((c, i) => {
      const { body: _b, next_mark: _n, ...rest } = c;
      const { body: _ob, next_mark: _on, ...orig } = anchored[i];
      expect(rest).toEqual(orig);
      expect(Object.keys(c).sort()).toEqual(Object.keys(anchored[i]).sort());
      if (c.start !== null)
        expect(answer.slice(c.start, c.start + c.quote.length)).toBe(c.quote);
    });
    expect(out[0].body).toBe("You link costs to prices. Third.");
    expect(out[0].next_mark).toBeNull();
    expect(out[1].body).toBe("Add the mechanism. It needs to be explicit.");
    expect(out[1].next_mark).toBe("Explain the margin squeeze.");
  });

  it("does not mutate its input", () => {
    const anchored = anchorComments(answer, raw);
    const copy = structuredClone(anchored);
    tightenComments(anchored);
    expect(anchored).toEqual(copy);
  });
});

describe("tightenSummary", () => {
  it("drops meta lines, keeps one sentence per line and at most three per list", () => {
    const out = tightenSummary({
      strengths: [
        "This summary covers your written short answers; multiple-choice (MC) answers were not supplied.",
        "Q1: you define inflation precisely. It helps.",
        "Q2: clear cost-push chain.",
        "Q3: you use the stimulus figure.",
        "Q4: tight contrast.",
      ],
      improvements: ["Overall, Q3 needs a judgement.", ""],
      next_steps: ["Rewrite Q3 with a judgement."],
    });
    expect(out).toEqual({
      strengths: [
        "Q1: you define inflation precisely.",
        "Q2: clear cost-push chain.",
        "Q3: you use the stimulus figure.",
      ],
      improvements: ["Q3 needs a judgement."],
      next_steps: ["Rewrite Q3 with a judgement."],
    });
  });

  it("keeps advice beside a meta clause in summary lines (codex review)", () => {
    expect(
      tightenSummary({
        strengths: [],
        improvements: [
          "This will not change your mark, but correct the Q3 definition.",
          "This summary covers written answers only.",
        ],
        next_steps: [],
      }).improvements,
    ).toEqual(["Correct the Q3 definition."]);
  });

  it("keeps empty lists empty", () => {
    expect(
      tightenSummary({ strengths: [], improvements: [], next_steps: [] }),
    ).toEqual({
      strengths: [],
      improvements: [],
      next_steps: [],
    });
  });
});
