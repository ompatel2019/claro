import { expect, it } from "vitest";
import {
  clampTarget,
  DEFAULTS,
  estimateMinutes,
  validPace,
  clampPace,
  filtersOn,
  fromParams,
  restore,
  summary,
  withMode,
  withTarget,
  withMixedCount,
  withSizeBy,
} from "./sprint";

const names = {
  t3: "Economic Issues",
  "t3-inflation": "Inflation",
  "t3-unemployment": "Unemployment",
  t4: "Economic Policies and Management",
};

it("switching type resets size to that type's default and range", () => {
  expect(withMode(DEFAULTS, "short")).toMatchObject({
    size_by: "marks",
    target: 30,
  });
  const mixed = withMode(DEFAULTS, "mixed");
  expect(mixed).toMatchObject({ size_by: "marks", target: 45 });
  expect(withSizeBy(withMode(DEFAULTS, "short"), "questions").target).toBe(5);
  const short = { ...withMode(DEFAULTS, "short"), difficulty: ["standard"] };
  expect(withMode(short as typeof DEFAULTS, "mcq").difficulty).toEqual([]);
  expect(clampTarget(DEFAULTS, 99)).toBe(40);
  expect(clampTarget(withMode(DEFAULTS, "mixed"), 3)).toBe(5);
});

it("estimates editable pace for each question type and untimed sessions", () => {
  expect(estimateMinutes(DEFAULTS)).toBe(20);
  expect(estimateMinutes({ ...DEFAULTS, mcq_min_per_q: 2 })).toBe(40);
  expect(estimateMinutes(withMode(DEFAULTS, "short"))).toBe(45);
  expect(
    estimateMinutes({ ...withMode(DEFAULTS, "short"), short_min_per_mark: 2 }),
  ).toBe(60);
  expect(
    estimateMinutes(withSizeBy(withMode(DEFAULTS, "short"), "questions")),
  ).toBe(23);
  expect(
    estimateMinutes({
      ...withMode(DEFAULTS, "mixed"),
      mcq_min_per_q: 2,
      short_min_per_mark: 1,
    }),
  ).toBe(68);
  expect(estimateMinutes({ ...DEFAULTS, timed: false })).toBeNull();
});
it.each([0, -1, 11, NaN, Infinity, "2", null, undefined])(
  "rejects invalid pace %s and restores defaults",
  (value) => {
    expect(validPace(value)).toBe(false);
    const c = restore({
      short_min_per_mark: value,
      mcq_min_per_q: value,
      pace: "custom",
      custom_minutes: 100,
    });
    expect(c.short_min_per_mark).toBe(1.5);
    expect(c.mcq_min_per_q).toBe(1);
    expect(c).not.toHaveProperty("pace");
    expect(c).not.toHaveProperty("custom_minutes");
  },
);
it.each([0.25, 1, 1.5, 10])(
  "keeps valid pace %s across restore and type changes",
  (value) => {
    expect(validPace(value)).toBe(true);
    expect(
      withMode(
        restore({ short_min_per_mark: value, mcq_min_per_q: value }),
        "short",
      ).short_min_per_mark,
    ).toBe(value);
  },
);
it("clamps input pace at the boundaries", () => {
  expect(clampPace(0)).toBe(0.25);
  expect(clampPace(11)).toBe(10);
  expect(clampPace(NaN)).toBe(1);
});

it("URL prefill wins and tolerates old subtopic links", () => {
  expect(fromParams({}, DEFAULTS)).toBeNull();
  expect(
    fromParams(
      { type: "short", sub: "t3-inflation", history: "prefer_new", size: "45" },
      DEFAULTS,
    ),
  ).toMatchObject({
    mode: "short",
    topics: ["t3"],
    subtopics: ["t3-inflation"],
    target: 45,
  });
  expect(fromParams({ topics: "t3-inflation" }, DEFAULTS)).toMatchObject({
    topics: ["t3"],
    subtopics: ["t3-inflation"],
  });
  const many = fromParams(
    { topics: "t1,t2,t3", size: "500", history: "x" },
    DEFAULTS,
  )!;
  expect(many.topics).toEqual(["t1", "t2"]);
  expect(many.target).toBe(40);
  expect(many.history).toBe("prefer_new");
  expect(fromParams({ verb: "Explain" }, DEFAULTS)!.verbs).toEqual([]);
});

it("restores a saved setup defensively", () => {
  expect(restore(null)).toEqual(DEFAULTS);
  expect(restore({ mode: "nope", target: 3 })).toMatchObject({
    mode: "mcq",
    target: 5,
  });
  expect(
    restore({
      ...withMode(DEFAULTS, "short"),
      size_by: "questions",
      target: 8,
    }),
  ).toMatchObject({ mode: "short", size_by: "questions", target: 8 });
});

it("summarises the setup in one line and counts extra filters", () => {
  const c = {
    ...withMode(DEFAULTS, "short"),
    topics: ["t3"],
    subtopics: ["t3-inflation", "t3-unemployment"],
    difficulty: ["foundation" as const],
  };
  expect(summary(c, names)).toBe(
    "30 marks · 45 min · Economic Issues (Inflation, Unemployment) · Prefer new",
  );
  expect(filtersOn(c)).toBe(1);
  expect(
    summary({ ...DEFAULTS, timed: false, history: "mistakes" }, names),
  ).toBe("20 questions · 20 marks · Untimed · Whole course · Mistakes only");
});

it("remembers the last size per type when switching back", () => {
  const mc5 = { ...DEFAULTS, target: 5 };
  const short = withMode(mc5, "short");
  expect(short.target).toBe(30);
  const back = withMode({ ...short, target: 45 }, "mcq");
  expect(back.target).toBe(5);
  expect(withMode(back, "short").target).toBe(45);
  const byQ = withSizeBy(
    { ...withMode(back, "short"), target: 50 },
    "questions",
  );
  expect(byQ.target).toBe(5);
  expect(withSizeBy({ ...byQ, target: 8 }, "marks").target).toBe(50);
  // Survives the saved setup, clamped to the type's range.
  expect(restore(JSON.parse(JSON.stringify(back))).sizes).toMatchObject({
    "mcq:questions": 5,
    "short:marks": 45,
  });
  expect(
    withMode(restore({ mode: "short", sizes: { "mcq:questions": 999 } }), "mcq")
      .target,
  ).toBe(40);
  expect(restore({ sizes: [1] }).sizes).toEqual({ "mcq:questions": 20 });
});

it("restores legacy auto-finish setups as overtime", () => {
  expect(restore({ on_timeout: "finish" }).on_timeout).toBe("overtime");
});

it("old essay setups fall back to MC and mixed setups discard essays", () => {
  expect(restore({ mode: "extended", target: 1 })).toMatchObject({
    mode: "mcq",
    target: 5,
  });
  expect(restore({ mode: "mixed", include_extended: true })).not.toHaveProperty(
    "include_extended",
  );
  expect(fromParams({ type: "extended" }, DEFAULTS)?.mode).toBe("mcq");
});

it("legacy shuffled setups restore exam order", () => {
  expect(restore({ ...DEFAULTS, order: "shuffled" }).order).toBe("exam");
});

it("mixed totals default to an even split, including odd totals and URL presets", () => {
  expect(withMode(DEFAULTS, "mixed")).toMatchObject({
    target: 45,
    mcq_count: 23,
    short_marks: 22,
  });
  expect(withTarget(withMode(DEFAULTS, "mixed"), 30)).toMatchObject({
    target: 30,
    mcq_count: 15,
    short_marks: 15,
  });
  expect(fromParams({ type: "mixed", size: "31" }, DEFAULTS)).toMatchObject({
    target: 31,
    mcq_count: 16,
    short_marks: 15,
  });
  expect(withTarget(withMode(DEFAULTS, "mixed"), 1000)).toMatchObject({
    target: 100,
    mcq_count: 50,
    short_marks: 50,
  });
});
it.each([
  [-5, 0],
  [0, 0],
  [15, 15],
  [30, 30],
  [99, 30],
  [1.6, 2],
  [NaN, 0],
  [Infinity, 0],
])("linked bucket clamps %s to %s and keeps the total", (value, count) => {
  const c = withTarget(withMode(DEFAULTS, "mixed"), 30);
  expect(withMixedCount(c, "mcq_count", value)).toMatchObject({
    mcq_count: count,
    short_marks: 30 - count,
  });
  expect(withMixedCount(c, "short_marks", value)).toMatchObject({
    short_marks: count,
    mcq_count: 30 - count,
  });
});
it("saved split survives reload while inconsistent and legacy splits are repaired", () => {
  expect(
    restore({ mode: "mixed", target: 30, mcq_count: 12, short_marks: 18 }),
  ).toMatchObject({ mcq_count: 12, short_marks: 18 });
  expect(
    restore({ mode: "mixed", target: 30, mcq_count: 12, short_marks: 99 }),
  ).toMatchObject({ mcq_count: 12, short_marks: 18 });
  expect(restore({ mode: "mixed", target: 30 })).toMatchObject({
    mcq_count: 15,
    short_marks: 15,
  });
  expect(restore({ mode: "mixed", target: 30, short_marks: 30 })).toMatchObject(
    { mcq_count: 0, short_marks: 30 },
  );
  expect(
    restore({ mode: "mixed", target: 30, mcq_count: Infinity }),
  ).toMatchObject({ mcq_count: 15, short_marks: 15 });
});
it("mixed estimate and summary follow the requested buckets, including zero-sized buckets", () => {
  const c = withMixedCount(
    withTarget(withMode(DEFAULTS, "mixed"), 30),
    "mcq_count",
    12,
  );
  expect(estimateMinutes(c)).toBe(39);
  expect(estimateMinutes(withMixedCount(c, "mcq_count", 30))).toBe(30);
  expect(estimateMinutes(withMixedCount(c, "mcq_count", 0))).toBe(45);
  expect(summary(c, {})).toContain(
    "30 marks · 12 multis + 18 marks of shorts · 39 min",
  );
  expect(estimateMinutes({ ...c, timed: false })).toBeNull();
});
it("non-finite total input clamps safely", () => {
  expect(clampTarget(DEFAULTS, NaN)).toBe(5);
  expect(clampTarget(withMode(DEFAULTS, "mixed"), Infinity)).toBe(5);
});

it("saved settings reject malformed arrays, unknown keys and non-finite size memories", () => {
  const c = restore({
    mode: "mixed",
    target: 30,
    topics: ["t1", 2, null, "t2", "t3"],
    subtopics: 42,
    difficulty: ["standard", "unknown"],
    origins: ["a1", "unknown"],
    verbs: null,
    history: "unknown",
    feedback: "unknown",
    sizes: { "extended:questions": 1, "mcq:questions": NaN },
    unknown: true,
    include_extended: true,
  });
  expect(c).toMatchObject({
    topics: ["t1", "t2"],
    subtopics: [],
    difficulty: ["standard"],
    origins: ["a1"],
    verbs: [],
    history: "prefer_new",
    feedback: "end",
  });
  expect(c).not.toHaveProperty("unknown");
  expect(c).not.toHaveProperty("include_extended");
  expect(c.sizes).not.toHaveProperty("extended:questions");
  expect(fromParams({ type: "toString" }, DEFAULTS)?.mode).toBe("mcq");
  expect(restore({ mode: "toString" }).mode).toBe("mcq");
});

it("keeps five-mark mixed totals through links, saved settings and type switches", () => {
  const c = withTarget(withMode(DEFAULTS, "mixed"), 5);
  expect(c).toMatchObject({ target: 5, mcq_count: 3, short_marks: 2 });
  expect(estimateMinutes(c)).toBe(6);
  expect(restore(c)).toMatchObject(c);
  expect(fromParams({ type: "mixed", size: "5" }, DEFAULTS)).toMatchObject(c);
  expect(withMode(withMode(c, "mcq"), "mixed").target).toBe(5);
});

it("drops retired year filters from saved setups and URL prefills", () => {
  const c = restore({ ...DEFAULTS, year_from: 2022, year_to: 2025 });
  expect(c).not.toHaveProperty("year_from");
  expect(c).not.toHaveProperty("year_to");
  expect(fromParams({ year_from: "2022" }, c)).toBeNull();
});
