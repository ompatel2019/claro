// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { topicSummary, type MarkableQuestion } from "./grade";
import { SUMMARY_ANSWER_MAX_CHARS } from "./prompts";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/openai", () => ({ callJson: vi.fn() }));
vi.mock("./examples", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./examples")>()),
  examplePool: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn() };
  return { admin: () => client };
});

import { callJson } from "@/lib/ai/openai";
import { examplePool } from "./examples";
import { admin } from "@/utils/supabase/admin";
import {
  AlreadyMarking,
  MARKER,
  finishSession,
  markAttempt,
  rescoreSession,
  markFlashcard,
  markWritten,
  summariseSession,
  transcribeImage,
} from "./engine";
import { MODELS } from "@/lib/ai/prices";
import {
  CheckSchema,
  FlashcardSchema,
  GradeSchema,
  SummarySchema,
  TranscriptSchema,
} from "./schemas";

const q: MarkableQuestion = {
  id: "q1",
  type: "short",
  marks: 4,
  stem: "Explain TWO effects.",
  stimulus: null,
  criteria: [
    { min: 3, max: 4, descriptor: "Explains two effects" },
    { min: 1, max: 2, descriptor: "Identifies an effect" },
  ],
  guideline_notes: null,
  sample_answer: null,
  source: "HSC",
};
const grade = {
  analysis: { strengths: ["First effect"], imprecise: [], missing: [] },
  elements_identified: "Two effects",
  bands_considered: [
    {
      band: q.criteria[0].descriptor,
      satisfied: true,
      evidence: "prices rise",
    },
  ],
  band_selected: q.criteria[0].descriptor,
  justification: 'Quotes "prices rise"',
  why_not_higher: "",
  mark: 4,
  comments: [
    {
      quote: "prices rise",
      kind: "strength" as const,
      body: "Clear",
      tag: "Analysis" as const,
      next_mark: null,
    },
    {
      quote: "invented",
      kind: "fix" as const,
      body: "More detail",
      tag: "Analysis" as const,
      next_mark: "Explain the mechanism",
    },
  ],
  earned: ["Effect"],
  missing_points: [],
  next_band: "",
  better_answer_outline: ["Cause", "Mechanism", "Effect"],
};
const checkGrade = (
  mark = grade.mark,
  justification = grade.justification,
) => ({
  analysis: grade.analysis,
  bands_considered: grade.bands_considered,
  band_selected:
    mark === 0
      ? "NO BAND SATISFIED"
      : q.criteria.find((c) => mark >= c.min && mark <= c.max)!.descriptor,
  mark,
  justification,
});
const mockedCall = vi.mocked(callJson);

beforeEach(() => {
  vi.resetAllMocks();
  mockedCall.mockResolvedValue(grade);
  vi.mocked(examplePool).mockResolvedValue([]);
});

it("returns validated grade on the first reply and anchors quotes", async () => {
  mockedCall.mockResolvedValue(grade);
  const result = await markWritten(q, "The prices rise rapidly", "user");
  expect(result).toMatchObject({
    mark: 4,
    band: q.criteria[0].descriptor,
    feedback: { validated: true, comments: [{ start: 4 }, { start: null }] },
  });
  expect(result.feedback).not.toHaveProperty("check");
  expect(mockedCall).toHaveBeenCalledTimes(2);
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      task: "mark_written",
      model: MODELS.marker,
      effort: "low",
      schema: GradeSchema,
      userId: "user",
    }),
  );
});

it("retries once with the invalid assistant reply and correction", async () => {
  const invalid = { ...grade, band_selected: "Invented" };
  mockedCall.mockResolvedValueOnce(invalid).mockResolvedValueOnce(grade);
  expect(
    (await markWritten(q, "The prices rise rapidly", "user")).feedback
      .validated,
  ).toBe(true);
  expect(mockedCall).toHaveBeenCalledTimes(3);
  const messages = mockedCall.mock.calls[2][0].messages;
  expect(messages[2]).toEqual({
    role: "assistant",
    content: JSON.stringify(invalid),
  });
  expect(messages[3].content).toContain("Your band/mark was invalid");
  expect(messages[3].content).toContain(q.criteria[0].descriptor);
});

it.each(["missing fix", "missing strength", "empty next mark"])(
  "retries once for %s",
  async (problem) => {
    const strength = grade.comments[0];
    const fix = grade.comments[1];
    const invalid = {
      ...grade,
      mark: 3,
      comments:
        problem === "missing fix"
          ? [strength, strength]
          : problem === "missing strength"
            ? [fix, fix]
            : [strength, { ...fix, next_mark: "  " }],
    };
    mockedCall.mockResolvedValueOnce(invalid).mockResolvedValueOnce(grade);
    expect(
      (await markWritten(q, "The prices rise rapidly", "user")).feedback
        .validated,
    ).toBe(true);
    expect(mockedCall).toHaveBeenCalledTimes(3);
    expect(mockedCall.mock.calls[2][0].messages[3].content).toContain(
      "comment",
    );
  },
);

it("retries a grade call once with a fix-up user message when the reply fails the schema", async () => {
  const answer = "The prices rise rapidly";
  const schemaError = z
    .object({ comments: z.array(z.object({ quote: z.string() })) })
    .safeParse({ comments: [{ quote: 1, body: answer }] }).error!;
  mockedCall.mockRejectedValueOnce(schemaError);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await markWritten(q, answer, "user")).toMatchObject({
      mark: 4,
      feedback: { validated: true },
    });
    expect(mockedCall).toHaveBeenCalledTimes(3);
    const { messages: original, ...firstOptions } = mockedCall.mock.calls[0][0];
    const { messages: retried, ...retryOptions } = mockedCall.mock.calls[2][0];
    expect(retryOptions).toEqual(firstOptions);
    expect(retryOptions.task).toBe("mark_written");
    expect(original).toHaveLength(2);
    expect(retried).toHaveLength(original.length + 1);
    expect(retried.slice(0, original.length)).toEqual(original);
    const fixUp = retried[original.length];
    expect(fixUp.role).toBe("user");
    expect(fixUp.content).toContain("comments.0.quote");
    expect(fixUp.content).toContain(schemaError.issues[0].message);
    expect(original).not.toContainEqual(fixUp);
    expect(warn).toHaveBeenCalledExactlyOnceWith({
      task: "mark_written",
      paths: [["comments", 0, "quote"]],
    });
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain(answer);
  } finally {
    warn.mockRestore();
  }
});

it("propagates a second consecutive schema failure", async () => {
  mockedCall.mockImplementation(async (options) => {
    if (options.task === "mark_written") throw new ZodError([]);
    return grade;
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await expect(
      markWritten(q, "The prices rise rapidly", "user"),
    ).rejects.toBeInstanceOf(ZodError);
    expect(mockedCall).toHaveBeenCalledTimes(3);
    expect(
      mockedCall.mock.calls.filter(([o]) => o.task === "mark_written"),
    ).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    warn.mockRestore();
  }
});

it("does not retry a non-schema error", async () => {
  mockedCall.mockRejectedValueOnce(new Error("Budget reached"));
  await expect(
    markWritten(q, "The prices rise rapidly", "user"),
  ).rejects.toThrow("Budget reached");
  expect(mockedCall).toHaveBeenCalledTimes(2);
});

it("returns original quote slices and cleaned prose from a canned reply", async () => {
  mockedCall.mockResolvedValue({
    ...grade,
    mark: 3,
    comments: [
      {
        ...grade.comments[0],
        quote: "PRICES rise",
        body: " Clear. ",
        next_mark: "Ignored",
      },
      {
        ...grade.comments[1],
        body: " Add detail. ",
        next_mark: " Explain demand. ",
      },
    ],
  });
  expect(
    (await markWritten(q, "The prices\n  rise rapidly", "user")).feedback
      .comments,
  ).toEqual([
    {
      ...grade.comments[0],
      quote: "prices\n  rise",
      start: 4,
      body: "Clear.",
      next_mark: null,
    },
    {
      ...grade.comments[1],
      start: null,
      body: "Add detail.",
      next_mark: "Explain demand.",
    },
  ]);
});

it("falls back after two invalid replies, clamping and matching the resulting band", async () => {
  mockedCall.mockResolvedValue({
    ...grade,
    band_selected: "Invented",
    mark: 99,
  });
  expect(await markWritten(q, "The prices rise rapidly", "user")).toMatchObject(
    { mark: 4, band: q.criteria[0].descriptor, feedback: { validated: false } },
  );
  expect(mockedCall).toHaveBeenCalledTimes(4);
});

it("starts both blind passes before either resolves", async () => {
  let resolveFirst!: (value: typeof grade) => void;
  let resolveCheck!: (value: ReturnType<typeof checkGrade>) => void;
  mockedCall
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
  const marking = markWritten(q, "prices rise", "user");
  await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
  expect(
    mockedCall.mock.calls.map(([o]) => [o.task, o.effort, o.fast, o.schema]),
  ).toEqual([
    ["mark_written", "low", true, GradeSchema],
    ["check_written", "low", true, CheckSchema],
  ]);
  expect(mockedCall.mock.calls[1][0].messages[1]).toEqual(
    mockedCall.mock.calls[0][0].messages[1],
  );
  expect(mockedCall.mock.calls[1][0].messages).toHaveLength(2);
  resolveCheck(checkGrade(3));
  resolveFirst(grade);
  expect(await marking).toMatchObject({
    mark: 4,
    check: { status: "agreed", marks: [4, 3] },
  });
});

it("puts the question's band anchors in the grader, blind check and reconciler prompts", async () => {
  vi.mocked(examplePool).mockResolvedValue([
    { answer_text: "Anchor four", tutor_mark: 4 },
  ]);
  mockedCall
    .mockResolvedValueOnce(grade)
    .mockResolvedValueOnce(checkGrade(2))
    .mockResolvedValueOnce(checkGrade(4));
  await markWritten(q, "prices rise", "user");
  expect(examplePool).toHaveBeenCalledWith(q);
  expect(mockedCall).toHaveBeenCalledTimes(3);
  for (const [{ messages }] of mockedCall.mock.calls)
    expect(messages[1].content).toContain(
      '<marked_answer tutor_mark="4">\nAnchor four\n</marked_answer>',
    );
});

it.each([undefined, "eval"])(
  "reconciles independently and uses the task override %s",
  async (task) => {
    mockedCall
      .mockResolvedValueOnce(grade)
      .mockResolvedValueOnce(checkGrade(2, "Marker B evidence"))
      .mockResolvedValueOnce(checkGrade(1, "Reconciler evidence"));
    const result = await markWritten(q, "prices rise", "user", task);
    expect(result).toMatchObject({
      mark: 1,
      band: q.criteria[1].descriptor,
      check: { status: "second_pass", marks: [4, 2, 1] },
      feedback: {
        justification: "Reconciler evidence",
        validated: true,
        earned: grade.earned,
        missing_points: grade.missing_points,
        next_band: grade.next_band,
        why_not_higher: grade.why_not_higher,
        better_answer_outline: grade.better_answer_outline,
        analysis: grade.analysis,
      },
    });
    expect(result.feedback.comments).toMatchObject(grade.comments);
    expect(mockedCall.mock.calls.map(([o]) => o.task)).toEqual(
      task
        ? [task, task, task]
        : ["mark_written", "check_written", "second_pass"],
    );
    expect(
      mockedCall.mock.calls.map(([o]) => [o.effort, o.fast, o.model]),
    ).toEqual([
      ["low", true, MODELS.marker],
      ["low", true, MODELS.marker],
      ["medium", true, MODELS.marker],
    ]);
    const messages = mockedCall.mock.calls[2][0].messages;
    expect(messages[2].content).toContain("Marker A:");
    expect(messages[2].content).toContain('"mark":4');
    expect(messages[2].content).toContain("Marker B:");
    expect(messages[2].content).toContain('"mark":2');
    expect(messages[2].content).toContain(
      grade.justification.replaceAll('"', '\\"'),
    );
    expect(messages[2].content).toContain("Marker B evidence");
  },
);

it("keeps the first assessment when the reconciler agrees with neither", async () => {
  mockedCall
    .mockResolvedValueOnce(grade)
    .mockResolvedValueOnce(checkGrade(2))
    .mockResolvedValueOnce(checkGrade(0, "Neither"));
  expect(await markWritten(q, "prices rise", null)).toMatchObject({
    mark: 4,
    band: q.criteria[0].descriptor,
    check: { status: "in_review", marks: [4, 2, 0] },
    feedback: {
      justification: grade.justification,
    },
  });
});

it("retries and clamps check passes independently without requiring feedback", async () => {
  mockedCall
    .mockResolvedValueOnce(grade)
    .mockResolvedValueOnce({ ...checkGrade(), mark: 99 })
    .mockResolvedValueOnce({ ...checkGrade(), mark: 99 });
  expect(await markWritten(q, "prices rise", null, "eval")).toMatchObject({
    mark: 4,
    check: { status: "agreed", marks: [4, 4] },
    feedback: { validated: true },
  });
  expect(mockedCall).toHaveBeenCalledTimes(3);
  for (const [options] of mockedCall.mock.calls)
    expect(options.task).toBe("eval");
});

it("passes flashcard results through using the cheap model", async () => {
  mockedCall.mockResolvedValue({ mark: 0.5, reason: "Partly correct" });
  expect(
    await markFlashcard(
      { kind: "term", front: "Inflation", back: "Rising price level" },
      "Prices",
      "user",
    ),
  ).toEqual({ mark: 0.5, reason: "Partly correct" });
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      model: MODELS.cheap,
      schema: FlashcardSchema,
      effort: "low",
      userId: "user",
    }),
  );
});

it.each([
  Buffer.from("image"),
  new Uint8Array([105, 109, 97, 103, 101]).buffer,
])("transcribes bytes without a network call %#", async (bytes) => {
  mockedCall.mockResolvedValue({
    lines: ["Prices rise", "Demand falls"],
    notes: "Diagram",
  });
  expect(await transcribeImage(bytes, "image/png", q.stem, "user")).toEqual({
    transcript: "Prices rise\nDemand falls",
    lines: ["Prices rise", "Demand falls"],
    notes: "Diagram",
  });
  const options = mockedCall.mock.calls[0][0];
  expect(options).toMatchObject({
    model: MODELS.strong,
    schema: TranscriptSchema,
    effort: "low",
  });
  expect(options.messages[1].content).toContainEqual({
    type: "image_url",
    image_url: { url: "data:image/png;base64,aW1hZ2U=" },
  });
});

it("summarises with the cheap model", async () => {
  const summary = {
    strengths: ["You explain"],
    improvements: ["Add effects"],
    next_steps: ["Practise"],
  };
  mockedCall.mockResolvedValue(summary);
  expect(await summariseSession([], "user")).toEqual(summary);
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      model: MODELS.cheap,
      schema: SummarySchema,
      effort: "low",
    }),
  );
});

function query(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
  };
  for (const key of [
    "select",
    "eq",
    "is",
    "maybeSingle",
    "in",
    "or",
    "order",
    "update",
    "single",
  ] as const)
    chain[key].mockReturnValue(chain);
  return chain;
}

it("marks MCQ deterministically and stores the answer key", async () => {
  const load = query({
    id: "attempt",
    user_id: "user",
    status: "pending",
    choice_index: 2,
    question: { ...q, type: "mcq", correct_index: 2 },
  });
  const save = query({ id: "attempt", mark: 1, status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(save as never);
  expect(await markAttempt("attempt")).toMatchObject({
    mark: 1,
    status: "marked",
  });
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 1,
      max_marks: 1,
      marked_by_model: "deterministic",
      band: null,
      feedback: { correct_index: 2, chosen_index: 2 },
      marked_at: expect.any(String),
    }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("uses an empty confirmed transcript in preference to answer_text", async () => {
  const load = query({
    id: "attempt",
    status: "transcribed",
    transcript: "",
    answer_text: "The prices rise rapidly",
    question: q,
  });
  const save = query({ mark: 0, status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(save as never);
  await markAttempt("attempt");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 0,
      max_marks: 4,
      feedback: { note: "No answer" },
      marked_by_model: "deterministic",
    }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it.each([null, "23505", "42501"])(
  "queues a disagreement before saving, tolerating only duplicate reviews (%s)",
  async (code) => {
    const load = query({
      id: "attempt",
      user_id: "user",
      status: "pending",
      answer_text: "The prices rise rapidly",
      question: q,
    });
    const error = code ? { code, message: "Review insert failed" } : null;
    const review = { insert: vi.fn().mockResolvedValue({ error }) };
    const save = query({ id: "attempt", mark: 4, status: "marked" });
    vi.mocked(admin().from)
      .mockReturnValueOnce(load as never)
      .mockReturnValueOnce(query([{ id: "attempt" }]) as never)
      .mockReturnValueOnce(review as never)
      .mockReturnValueOnce(save as never);
    mockedCall
      .mockResolvedValueOnce(grade)
      .mockResolvedValueOnce(checkGrade(2))
      .mockResolvedValueOnce(checkGrade(0));

    if (code === "42501") {
      await expect(markAttempt("attempt")).rejects.toBe(error);
      expect(save.update).toHaveBeenCalledExactlyOnceWith({ status: "failed" });
    } else {
      await expect(markAttempt("attempt")).resolves.toMatchObject({ mark: 4 });
      expect(save.update).toHaveBeenCalledWith(
        expect.objectContaining({
          mark: 4,
          status: "marked",
          check_status: "in_review",
          marked_by_model: MARKER.model,
        }),
      );
      expect(save.update.mock.calls[0][0]).not.toHaveProperty("check");
      expect(save.update.mock.calls[0][0].feedback).not.toHaveProperty("check");
    }
    expect(admin().from).toHaveBeenNthCalledWith(3, "mark_reviews");
    expect(review.insert).toHaveBeenCalledExactlyOnceWith({
      attempt_id: "attempt",
      user_id: "user",
      reason: "check_disagreed",
      ai_mark: 4,
      ai_model: MARKER.model,
      check_mark: 2,
      check_model: MARKER.model,
      check_notes: "Reconciling pass: 0",
    });
    expect(review.insert.mock.invocationCallOrder[0]).toBeLessThan(
      save.update.mock.invocationCallOrder[0],
    );
  },
);

it("sets failed and rethrows when grading fails", async () => {
  const load = query({
    id: "attempt",
    user_id: "user",
    status: "pending",
    transcript: null,
    answer_text: "The prices rise rapidly",
    question: q,
  });
  const marking = query([{ id: "attempt" }]);
  const failed = query(null);
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(marking as never)
    .mockReturnValueOnce(failed as never);
  mockedCall.mockRejectedValue(new Error("Budget reached"));
  await expect(markAttempt("attempt")).rejects.toThrow("Budget reached");
  expect(marking.update).toHaveBeenCalledWith({
    status: "marking",
    claimed_at: expect.any(String),
  });
  expect(marking.eq).toHaveBeenCalledWith("id", "attempt");
  expect(marking.or).toHaveBeenCalledWith(
    expect.stringMatching(
      /^status.in.\(pending,transcribed,failed\),and\(status.eq.marking,claimed_at.lt./,
    ),
  );
  expect(marking.select).toHaveBeenCalledWith("id");
  expect(failed.update).toHaveBeenCalledWith({ status: "failed" });
});

it("throws AlreadyMarking without setting failed when no attempt is claimed", async () => {
  const load = query({
    id: "attempt",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    question: q,
  });
  const marking = query([]);
  const failed = query(null);
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(marking as never)
    .mockReturnValueOnce(failed as never);
  await expect(markAttempt("attempt")).rejects.toBeInstanceOf(AlreadyMarking);
  expect(marking.update).toHaveBeenCalledExactlyOnceWith({
    status: "marking",
    claimed_at: expect.any(String),
  });
  expect(admin().from).toHaveBeenCalledTimes(2);
  expect(failed.update).not.toHaveBeenCalled();
  expect(mockedCall).not.toHaveBeenCalled();
});

it("returns an already finished session without marking or summarising", async () => {
  const session = {
    id: "session",
    finished_at: "2026-10-08",
    score: 3,
    max_score: 4,
  };
  vi.mocked(admin().from).mockReturnValueOnce(query(session) as never);
  expect(await finishSession("session")).toEqual(session);
  expect(admin().from).toHaveBeenCalledTimes(1);
  expect(mockedCall).not.toHaveBeenCalled();
});

it("totals flashcard reviews without calling the model", async () => {
  const save = query({ score: 1.5, max_score: 3, summary: null });
  vi.mocked(admin().from)
    .mockReturnValueOnce(
      query({
        id: "session",
        user_id: "user",
        kind: "flashcards",
        finished_at: null,
      }) as never,
    )
    .mockReturnValueOnce(
      query([
        { flashcard_id: "a", mark: 1 },
        { flashcard_id: "b", mark: 0.5 },
        { flashcard_id: "c", mark: 0 },
        { flashcard_id: "c", mark: 1 },
        { flashcard_id: "b", mark: 1 },
      ]) as never,
    )
    .mockReturnValueOnce(save as never);
  expect(await finishSession("session")).toMatchObject({
    score: 1.5,
    max_score: 3,
  });
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 1.5, max_score: 3, summary: null }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("persists a written grade and skips grading an already marked attempt", async () => {
  const save = query({ id: "attempt", mark: 4, status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(
      query({
        id: "attempt",
        user_id: "user",
        status: "transcribed",
        transcript: "The prices rise rapidly",
        answer_text: "Older answer",
        question: q,
      }) as never,
    )
    .mockReturnValueOnce(query([{ id: "attempt" }]) as never)
    .mockReturnValueOnce(save as never);
  mockedCall.mockResolvedValue(grade);
  await markAttempt("attempt");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 4,
      max_marks: 4,
      band: q.criteria[0].descriptor,
      status: "marked",
      check_status: "agreed",
      marked_by_model: MARKER.model,
      feedback: expect.objectContaining({ validated: true }),
    }),
  );
  expect(mockedCall.mock.calls[0][0].messages[1].content).toContain(
    "The prices rise rapidly",
  );
  vi.mocked(admin().from).mockReturnValueOnce(
    query({ id: "attempt", mark: 4, status: "marked", question: q }) as never,
  );
  expect(await markAttempt("attempt")).toEqual({
    id: "attempt",
    mark: 4,
    status: "marked",
  });
  expect(mockedCall).toHaveBeenCalledTimes(2);
});

it("marks unfinished session attempts in parallel before totalling and summarising", async () => {
  const first = {
    id: "first",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    transcript: null,
    question: q,
  };
  const second = { ...first, id: "second" };
  const alreadyMarked = {
    ...first,
    id: "third",
    status: "marked",
    mark: 2,
    max_marks: 4,
    band: q.criteria[1].descriptor,
    feedback: {
      analysis: { strengths: ["Identifies an effect"] },
      missing_points: ["Explain mechanism"],
    },
  };
  const completed = [first, second].map((a) => ({
    ...a,
    status: "marked",
    mark: 4,
    max_marks: 4,
    band: q.criteria[0].descriptor,
    feedback: {
      analysis: { strengths: ["Clear effects"] },
      missing_points: [],
    },
  }));
  const save = query({ score: 10, max_score: 12 });
  const chains = [
    query({
      id: "session",
      user_id: "user",
      kind: "sprint",
      finished_at: null,
    }),
    query([first, second, alreadyMarked]),
    query(first),
    query(second),
    query([{ id: "first" }]),
    query([{ id: "second" }]),
    query(completed[0]),
    query(completed[1]),
    query([...completed, alreadyMarked]),
    save,
  ];
  for (const chain of chains)
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  let resolveFirst!: (value: typeof grade) => void;
  let resolveSecond!: (value: typeof grade) => void;
  mockedCall
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(checkGrade())
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    )
    .mockResolvedValueOnce(checkGrade())
    .mockResolvedValueOnce({
      strengths: ["You explain"],
      improvements: ["Explain mechanism"],
      next_steps: ["Practise"],
    });
  const finishing = finishSession("session");
  await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(4));
  expect(save.update).not.toHaveBeenCalled();
  resolveFirst(grade);
  resolveSecond(grade);
  expect(await finishing).toMatchObject({ score: 10, max_score: 12 });
  expect(mockedCall).toHaveBeenCalledTimes(5);
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      score: 10,
      max_score: 12,
      summary: expect.objectContaining({ improvements: ["Explain mechanism"] }),
    }),
  );
});

it("retries failures once and finishes with all possible marks in the denominator", async () => {
  const attempt = {
    id: "attempt",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    transcript: null,
    question: q,
  };
  const failed = { ...attempt, status: "failed", mark: 99 };
  const save = query({ score: 0, max_score: 4, summary: null });
  for (const chain of [
    query({ user_id: "user", kind: "sprint" }),
    query([attempt]),
    query(attempt),
    query([{ id: "attempt" }]),
    query(null),
    query([failed]),
    query(failed),
    query([{ id: "attempt" }]),
    query(null),
    query([failed]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  mockedCall.mockRejectedValue(new Error("Budget reached"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await finishSession("session")).toMatchObject({
    score: 0,
    max_score: 4,
  });
  expect(mockedCall).toHaveBeenCalledTimes(4);
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 0, max_score: 4, summary: null }),
  );
  log.mockRestore();
});

it("finishes an empty sprint without a summary call", async () => {
  const save = query({ score: 0, max_score: 0, summary: null });
  for (const chain of [
    query({
      id: "session",
      user_id: "user",
      kind: "sprint",
      finished_at: null,
    }),
    query([]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  await finishSession("session");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 0, max_score: 0, summary: null }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("waits for fresh in-flight marking and uses a deterministic topic summary", async () => {
  vi.useFakeTimers();
  try {
    const inflight = {
      id: "a",
      status: "marking",
      claimed_at: new Date().toISOString(),
      question: { ...q, type: "mcq", topic: { name: "Inflation" } },
    };
    const marked = {
      ...inflight,
      status: "marked",
      mark: 1,
      max_marks: 1,
      marked_by_model: "deterministic",
      feedback: { correct_index: 0 },
    };
    const save = query({ score: 1, max_score: 1 });
    for (const chain of [
      query({ user_id: "user", kind: "sprint" }),
      query([inflight]),
      query([marked]),
      save,
    ])
      vi.mocked(admin().from).mockReturnValueOnce(chain as never);
    const finishing = finishSession("s");
    await vi.advanceTimersByTimeAsync(1500);
    await finishing;
    expect(mockedCall).not.toHaveBeenCalled();
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({
          strengths: ["1/1 correct on Inflation."],
        }),
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});
it("finishes even when the AI summary fails", async () => {
  const row = {
    answer_text: "Prices rise.",
    status: "marked",
    mark: 2,
    max_marks: 4,
    feedback: { analysis: { strengths: [] } },
    question: q,
  };
  const save = query({ score: 2, max_score: 4 });
  for (const chain of [
    query({ user_id: "user", kind: "sprint" }),
    query([row]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  mockedCall.mockRejectedValue(new Error("Summary failed"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await finishSession("s");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 2, summary: null }),
  );
  log.mockRestore();
});
it("rescores a finished session using marked marks over all possible marks", async () => {
  const save = query(null);
  for (const chain of [
    query({ user_id: "user", finished_at: "2026-10-08" }),
    query([
      { status: "marked", mark: 3, max_marks: 4, question: q },
      { status: "failed", mark: 99, max_marks: null, question: q },
    ]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  await rescoreSession("s");
  expect(save.update).toHaveBeenCalledWith({ score: 3, max_score: 8 });
});
it("does not rescore an unfinished session", async () => {
  vi.mocked(admin().from).mockReturnValueOnce(
    query({ user_id: "user", finished_at: null }) as never,
  );
  await rescoreSession("s");
  expect(admin().from).toHaveBeenCalledTimes(1);
});

it("web eval Single uses the selected model and high effort for one pass with task eval", async () => {
  mockedCall.mockResolvedValue(grade);
  const onUsage = vi.fn();
  const result = await markWritten(q, "prices rise", null, "eval", {
    model: "gpt-6-luna",
    effort: "high",
    blind: false,
    onUsage,
  });
  expect(mockedCall).toHaveBeenCalledTimes(1);
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      model: "gpt-6-luna",
      effort: "high",
      task: "eval",
      onUsage,
    }),
  );
  expect(result.check.marks).toEqual([4]);
});
it("web eval blind and reconcile passes use the selected model/effort and task eval", async () => {
  mockedCall
    .mockResolvedValueOnce(grade)
    .mockResolvedValueOnce(checkGrade(1))
    .mockResolvedValueOnce(checkGrade(4));
  await markWritten(q, "prices rise", null, "eval", {
    model: "gpt-6-luna",
    effort: "high",
    blind: true,
  });
  expect(mockedCall).toHaveBeenCalledTimes(3);
  for (const [options] of mockedCall.mock.calls)
    expect(options).toMatchObject({
      model: "gpt-6-luna",
      effort: "high",
      task: "eval",
    });
});

it.each([true, false])(
  "settles the sibling before rejecting for student and eval calls (configured: %s)",
  async (configured) => {
    let finish!: () => void;
    const usage = vi.fn();
    mockedCall
      .mockRejectedValueOnce(new Error("first failed"))
      .mockImplementationOnce(
        (options) =>
          new Promise((resolve) => {
            finish = () => {
              options.onUsage?.(0.02);
              resolve(checkGrade());
            };
          }),
      );
    let settled = false;
    const marking = markWritten(
      q,
      "prices rise",
      null,
      configured ? "eval" : undefined,
      configured
        ? { model: "gpt-6-luna", effort: "low", blind: true, onUsage: usage }
        : undefined,
    ).catch((error) => {
      settled = true;
      return error;
    });
    await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    finish();
    expect(await marking).toEqual(new Error("first failed"));
    if (configured) expect(usage).toHaveBeenCalledWith(0.02);
  },
);
it("stops configured eval corrections when the step signal aborts", async () => {
  const controller = new AbortController();
  mockedCall.mockImplementationOnce(async () => {
    controller.abort(new Error("deadline"));
    return { ...grade, mark: 1 };
  });
  await expect(
    markWritten(q, "prices rise", null, "eval", {
      model: "gpt-6-luna",
      effort: "low",
      blind: false,
      signal: controller.signal,
    }),
  ).rejects.toThrow("deadline");
  expect(mockedCall).toHaveBeenCalledTimes(1);
});

it("passes eval exclusions to retrieval for all marking passes", async () => {
  await markWritten(q, "prices rise", null, "eval:fixture", undefined, [
    "locked-final",
    "dev-self",
  ]);
  expect(examplePool).toHaveBeenCalledWith(q, ["locked-final", "dev-self"]);
});

it("waits for the first mark before retrieving quotas for check and reconciliation", async () => {
  const examples = Array.from({ length: 12 }, (_, i) => ({
    tutor_mark: i % 5,
    answer_text: i >= 6 ? `prices rise ${i}` : `unrelated ${i}`,
    accepted_tutor_comments: [{ body: `Rationale ${i}` }],
  }));
  vi.mocked(examplePool).mockResolvedValue(examples);
  let resolveFirst!: (value: typeof grade) => void;
  mockedCall
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(checkGrade(2))
    .mockResolvedValueOnce(checkGrade(4));
  const marking = markWritten(
    q,
    "prices rise",
    null,
    "eval:fixture",
    undefined,
    ["dev-self"],
  );
  await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(1));
  resolveFirst(grade);
  await marking;
  expect(examplePool).toHaveBeenCalledExactlyOnceWith(q, ["dev-self"]);
  const firstPrompt = mockedCall.mock.calls[0][0].messages[1].content as string;
  const checkPrompt = mockedCall.mock.calls[1][0].messages[1].content as string;
  expect(checkPrompt).not.toEqual(firstPrompt);
  expect(checkPrompt.match(/<marked_answer /g)).toHaveLength(6);
  expect(checkPrompt).toContain(
    '<marked_answer tutor_mark="4">\nprices rise 9',
  );
  expect(checkPrompt).toContain("Rationale 9");
  expect(mockedCall.mock.calls[2][0].messages[1].content).toEqual(checkPrompt);
});

it.each([4, 3, 2])(
  "keeps unequal initial marks (%s) out of feedback",
  async (second) => {
    mockedCall
      .mockResolvedValueOnce(grade)
      .mockResolvedValueOnce(checkGrade(second))
      .mockResolvedValueOnce(checkGrade(4));
    const result = await markWritten(q, "The prices rise rapidly", null);
    expect(result.feedback).not.toHaveProperty("flags");
    expect(result.check.marks.slice(0, 2)).toEqual([4, second]);
  },
);

it("leaves a single-pass result unflagged", async () => {
  const result = await markWritten(q, "The prices rise rapidly", null, "eval", {
    model: MARKER.model,
    effort: "low",
    blind: false,
  });
  expect(result.feedback).not.toHaveProperty("flags");
});

it("never persists uncertainty or pass marks in attempt feedback after reconciliation", async () => {
  const save = query({ id: "attempt", status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(
      query({
        id: "attempt",
        user_id: "user",
        status: "pending",
        answer_text: "The prices rise rapidly",
        question: q,
      }) as never,
    )
    .mockReturnValueOnce(query([{ id: "attempt" }]) as never)
    .mockReturnValueOnce(save as never);
  mockedCall
    .mockResolvedValueOnce(grade)
    .mockResolvedValueOnce(checkGrade(2))
    .mockResolvedValueOnce(checkGrade(4));
  await markAttempt("attempt");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      check_status: "second_pass",
      feedback: expect.not.objectContaining({ flags: expect.anything() }),
    }),
  );
});

it.each([
  [
    "typed writing",
    "Your typed definition.\nYour explanation.",
    null,
    "Your typed definition.\nYour explanation.",
  ],
  [
    "handwriting",
    "Old typed draft",
    "Your transcribed definition.\nYour explanation.",
    "Your transcribed definition.\nYour explanation.",
  ],
  [
    "long answer",
    "a".repeat(SUMMARY_ANSWER_MAX_CHARS + 1),
    null,
    "a".repeat(SUMMARY_ANSWER_MAX_CHARS),
  ],
])(
  "summarises %s from written evidence only in a mixed session",
  async (_name, answer_text, transcript, answer) => {
    const written = {
      status: "marked",
      mark: 2,
      max_marks: 4,
      band: q.criteria[1].descriptor,
      answer_text,
      transcript,
      feedback: {
        analysis: { strengths: ["Defines terms"] },
        missing_points: ["Link the effects"],
      },
      question: q,
    };
    const mcq = {
      ...written,
      mark: 1,
      max_marks: 1,
      answer_text: "MCQ choices are not writing evidence",
      feedback: { correct_index: 0 },
      question: { ...q, type: "mcq", marks: 1 },
    };
    const summary = {
      strengths: [
        "In this answer, you introduce the key term before explaining its effects.",
      ],
      improvements: ["In this answer, connect each effect to its cause."],
      next_steps: ["Rewrite one explanation using a because link."],
    };
    const save = query({ score: 3, max_score: 5, summary });
    for (const chain of [
      query({ user_id: "user", kind: "sprint" }),
      query([mcq, written]),
      save,
    ])
      vi.mocked(admin().from).mockReturnValueOnce(chain as never);
    mockedCall.mockResolvedValue(summary);
    await finishSession("s");
    expect(mockedCall).toHaveBeenCalledTimes(1);
    const call = mockedCall.mock.calls[0][0];
    expect(call.task).toBe("session_summary");
    expect(call.userId).toBe("user");
    expect(JSON.parse(call.messages[1].content as string)).toEqual([
      {
        source: q.source,
        stem: q.stem,
        mark: 2,
        max: 4,
        band: q.criteria[1].descriptor,
        answer,
        strengths: ["Defines terms"],
        improvements: ["Link the effects"],
      },
    ]);
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({ score: 3, max_score: 5, summary }),
    );
  },
);

it("supplies legacy written answers without analysis and compares multiple answers", async () => {
  const rows = [
    "First definition. First explanation.",
    "Second definition. Second explanation.",
  ].map((answer_text) => ({
    status: "marked",
    mark: 4,
    max_marks: 4,
    answer_text,
    transcript: null,
    feedback: null,
    question: q,
  }));
  const save = query({ score: 8, max_score: 8 });
  for (const chain of [
    query({ user_id: "user", kind: "sprint" }),
    query(rows),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  mockedCall.mockResolvedValue({
    strengths: ["You define terms in both answers."],
    improvements: [],
    next_steps: [],
  });
  await finishSession("s");
  const evidence = JSON.parse(
    mockedCall.mock.calls[0][0].messages[1].content as string,
  );
  expect(evidence.map((item: { answer: string }) => item.answer)).toEqual(
    rows.map((r) => r.answer_text),
  );
  expect(evidence[0]).toMatchObject({
    strengths: [],
    improvements: [],
    answer: rows[0].answer_text,
  });
});

it.each([
  ["missing writing and analysis", null, null, null],
  ["blank writing", " \n\t ", null, null],
  ["empty transcript overriding a draft", "Old typed draft", "", null],
  ["blank writing with analysis", "", null, { analysis: { strengths: [] } }],
  ["No answer marker", "Old draft", null, { note: "No answer" }],
])(
  "uses a free topic summary for %s",
  async (_name, answer_text, transcript, feedback) => {
    const written = {
      status: "marked",
      mark: 0,
      max_marks: 4,
      answer_text,
      transcript,
      feedback,
      question: { ...q, topic: { name: "Inflation" } },
    };
    const save = query({ score: 0, max_score: 4 });
    for (const chain of [
      query({ user_id: "user", kind: "sprint" }),
      query([written]),
      save,
    ])
      vi.mocked(admin().from).mockReturnValueOnce(chain as never);
    await finishSession("s");
    expect(mockedCall).not.toHaveBeenCalled();
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 0,
        max_score: 4,
        summary: topicSummary([{ topic: "Inflation", correct: false }]),
      }),
    );
  },
);

it.each([false, true])(
  "filters blank and No answer attempts in a mixed session (usable writing: %s)",
  async (hasWriting) => {
    const written = {
      status: "marked",
      mark: 4,
      max_marks: 4,
      answer_text: "Prices rise because demand exceeds supply.",
      transcript: null,
      feedback: { analysis: { strengths: ["Explains cause and effect"] } },
      question: { ...q, topic: { name: "Inflation" } },
    };
    const rows = [
      {
        ...written,
        mark: 1,
        max_marks: 1,
        question: { ...written.question, type: "mcq", marks: 1 },
      },
      { ...written, mark: 0, answer_text: " \n\t " },
      { ...written, mark: 0, transcript: "" },
      { ...written, mark: 0, answer_text: null },
      { ...written, mark: 0, feedback: { note: "No answer" } },
      ...(hasWriting ? [written] : []),
    ];
    const summary = {
      strengths: ["You explain causes."],
      improvements: [],
      next_steps: [],
    };
    const save = query(null);
    for (const chain of [
      query({ user_id: "user", kind: "sprint" }),
      query(rows),
      save,
    ])
      vi.mocked(admin().from).mockReturnValueOnce(chain as never);
    mockedCall.mockResolvedValue(summary);
    await finishSession("s");
    expect(mockedCall).toHaveBeenCalledTimes(hasWriting ? 1 : 0);
    if (hasWriting) {
      const evidence = JSON.parse(
        mockedCall.mock.calls[0][0].messages[1].content as string,
      );
      expect(evidence).toHaveLength(1);
      expect(evidence[0].answer).toBe(written.answer_text);
    }
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({
        score: hasWriting ? 5 : 1,
        max_score: hasWriting ? 21 : 17,
        summary: hasWriting
          ? summary
          : topicSummary(
              rows.map((a) => ({
                topic: "Inflation",
                correct: a.mark === a.max_marks,
              })),
            ),
      }),
    );
  },
);

it("discards a result if the answer was edited while the model was marking", async () => {
  const attempt = {
    id: "a",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    transcript: null,
    question: q,
  };
  const claim = query([{ id: "a" }]);
  const staleSave = query(null);
  const release = query(null);
  for (const chain of [query(attempt), claim, staleSave, release])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  mockedCall.mockResolvedValueOnce(grade).mockResolvedValueOnce(checkGrade());
  await expect(markAttempt("a")).rejects.toBeInstanceOf(AlreadyMarking);
  expect(claim.eq).toHaveBeenCalledWith("answer_text", attempt.answer_text);
  expect(claim.is).toHaveBeenCalledWith("transcript", null);
  expect(staleSave.eq).toHaveBeenCalledWith("answer_text", attempt.answer_text);
  expect(staleSave.eq).toHaveBeenCalledWith(
    "claimed_at",
    claim.update.mock.calls[0][0].claimed_at,
  );
  expect(release.eq).toHaveBeenCalledWith(
    "claimed_at",
    claim.update.mock.calls[0][0].claimed_at,
  );
  expect(release.update).toHaveBeenCalledWith({ status: "pending" });
});

it("does not finalize a session while background marking is still running", async () => {
  vi.useFakeTimers();
  try {
    const load = query({ user_id: "user", kind: "sprint" });
    const running = query([
      {
        id: "a",
        status: "marking",
        claimed_at: new Date().toISOString(),
        question: q,
      },
    ]);
    vi.mocked(admin().from)
      .mockReturnValueOnce(load as never)
      .mockReturnValue(running as never);
    const finished = finishSession("s").catch((error) => error);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(await finished).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("still being marked"),
      }),
    );
    expect(running.update).not.toHaveBeenCalled();
    expect(mockedCall).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("a concurrent background/Finish caller that loses the claim never calls the model", async () => {
  const attempt = {
    id: "a",
    user_id: "user",
    status: "pending",
    claimed_at: null,
    answer_text: "The prices rise rapidly",
    transcript: null,
    question: q,
  };
  const winner = query([{ id: "a" }]);
  for (const chain of [
    query(attempt),
    winner,
    query({ ...attempt, status: "marking" }),
    query([]),
    query({ id: "a", status: "marked", mark: 4 }),
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  let resolve!: (value: typeof grade) => void;
  mockedCall
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce(checkGrade());
  const background = markAttempt("a");
  await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
  await expect(markAttempt("a")).rejects.toBeInstanceOf(AlreadyMarking);
  expect(mockedCall).toHaveBeenCalledTimes(2);
  resolve(grade);
  expect(await background).toMatchObject({ status: "marked", mark: 4 });
});

it("keeps the claim while the other paid grading pass is still running after a failure", async () => {
  const release = query(null);
  for (const chain of [
    query({
      id: "a",
      user_id: "user",
      status: "pending",
      claimed_at: null,
      answer_text: "The prices rise rapidly",
      transcript: null,
      question: q,
    }),
    query([{ id: "a" }]),
    release,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  let complete!: (value: ReturnType<typeof checkGrade>) => void;
  mockedCall
    .mockRejectedValueOnce(new Error("First pass failed"))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
  const marking = markAttempt("a").catch((error) => error);
  await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
  expect(release.update).not.toHaveBeenCalled();
  complete(checkGrade());
  expect(await marking).toEqual(new Error("First pass failed"));
  expect(release.update).toHaveBeenCalledWith({ status: "failed" });
});

it.each([null, "2026-10-16T00:00:00.000Z"])(
  "guards a deterministic result against an edited answer version (%s)",
  async (claimed_at) => {
    const save = query(null);
    vi.mocked(admin().from)
      .mockReturnValueOnce(
        query({
          id: "a",
          status: "pending",
          claimed_at,
          answer_text: "",
          transcript: null,
          question: q,
        }) as never,
      )
      .mockReturnValueOnce(save as never);
    await expect(markAttempt("a")).rejects.toBeInstanceOf(AlreadyMarking);
    if (claimed_at === null)
      expect(save.is).toHaveBeenCalledWith("claimed_at", null);
    else expect(save.eq).toHaveBeenCalledWith("claimed_at", claimed_at);
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({ check_status: "skipped" }),
    );
    expect(mockedCall).not.toHaveBeenCalled();
  },
);
