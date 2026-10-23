import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { ReviewRow } from "@/lib/feedback";
import { DEFAULTS, withMode, type Pool } from "@/lib/sprint";

// Inject only the entry component's state; child hooks retain their real SSR values.
const state = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  pending: false,
  error: false,
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.index++;
      return actual.useState(
        index < state.values.length ? state.values[index] : initial,
      );
    },
    useActionState: () => [
      { error: state.error ? "Try again." : undefined },
      () => {},
      state.pending,
    ],
  };
});
vi.mock("@/app/(app)/actions", () => ({ startSprint: vi.fn() }));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { SprintSetup, QuickStarts, SameSetup } from "./sprint-setup";
import { AnnotatedFeedback, FeedbackDetails } from "./annotated-feedback";

const topics = [
  { id: "t1", name: "Macro", parent_id: null, sort: 1 },
  { id: "s1", name: "Inflation", parent_id: "t1", sort: 2 },
  { id: "t2", name: "Micro", parent_id: null, sort: 3 },
];
const pool: Pool = {
  questions: 40,
  marks: 60,
  mcq_questions: 20,
  mcq_new: 10,
  short_marks: 40,
  any: 50,
  new: 20,
  mistakes: 5,
  flagged: 3,
  topics: { t1: 10 },
  subtopics: { s1: 5 },
  all_subtopics: 60,
  verbs: { Explain: 10 },
  difficulty: { standard: 20 },
  trial: true,
};
const comments = [
  {
    id: 1,
    quote: "Demand",
    start: 0,
    kind: "strength" as const,
    tag: "Knowledge" as const,
    body: "Correct cause.",
    next_mark: null,
  },
  {
    id: 2,
    quote: "grew",
    start: 7,
    kind: "fix" as const,
    tag: "Evidence" as const,
    body: "Give evidence.",
    next_mark: "Quote CPI.",
  },
  {
    id: 3,
    quote: "",
    start: null,
    kind: "fix" as const,
    tag: "Structure" as const,
    body: "Conclude.",
    next_mark: null,
  },
];
const row: ReviewRow = {
  attempt_id: "a1",
  position: 1,
  question_id: "q1",
  type: "short",
  marks: 6,
  stem: "Explain inflation.",
  stimulus: null,
  options: null,
  source: "2023 HSC",
  topic_id: "s1",
  year: 2023,
  choice_index: null,
  answer_text: "Demand grew.\r\nWages lagg[?].",
  transcript: null,
  image_paths: null,
  flagged: false,
  status: "marked",
  check_status: "agreed",
  mark: 3,
  max_marks: 6,
  band: "Sound",
  feedback: { comments, better_answer_outline: ["Add evidence."] },
  correct_index: null,
  criteria: [
    { min: 0, max: 2, descriptor: "Basic" },
    { min: 3, max: 4, descriptor: "Sound" },
    { min: 5, max: 6, descriptor: "Thorough" },
  ],
  sample_answer: "Model answer.",
  explanation: null,
  review: null,
};
afterEach(() => {
  state.values = [];
  state.index = 0;
  state.pending = false;
  state.error = false;
});

function pin(ui: React.ReactNode) {
  state.index = 0;
  const html = renderToStaticMarkup(ui);
  // Baselines were captured from the original, unsplit components. Hash the full,
  // unnormalised HTML, including IDs, classes, text and form payloads.
  expect(
    `${Buffer.byteLength(html)}:${createHash("sha256").update(html).digest("hex")}`,
  ).toMatchSnapshot();
}

for (const mode of ["mcq", "short", "mixed"] as const) {
  for (const scenario of [
    "loading",
    "populated",
    "empty",
    "shortfall",
    "error",
    "pending",
    "custom",
  ] as const) {
    it(`preserves sprint ${mode} / ${scenario}`, () => {
      const config = {
        ...withMode(DEFAULTS, mode),
        topics: ["t1"],
        subtopics: ["s1"],
        timed: scenario !== "custom",
        feedback: "each" as const,
      };
      const counts =
        scenario === "loading"
          ? null
          : scenario === "empty"
            ? {
                ...pool,
                questions: 0,
                marks: 0,
                mcq_questions: 0,
                short_marks: 0,
              }
            : scenario === "shortfall"
              ? {
                  ...pool,
                  questions: 2,
                  marks: 3,
                  mcq_questions: 1,
                  short_marks: 2,
                }
              : pool;
      state.values = [
        config,
        scenario === "custom" ? DEFAULTS : null,
        counts,
        scenario === "error",
        scenario === "custom",
      ];
      state.pending = scenario === "pending";
      state.error = scenario === "error";
      pin(
        <SprintSetup topics={scenario === "empty" ? [] : topics} params={{}} />,
      );
    });
  }
}
for (const variant of ["default", "weak", "previous", "both"] as const) {
  for (const action of ["ready", "pending", "error"] as const) {
    it(`preserves quick starts ${variant} / ${action}`, () => {
      state.pending = action === "pending";
      state.error = action === "error";
      pin(
        <QuickStarts
          weak={
            variant === "weak" || variant === "both" ? topics[1] : undefined
          }
          previous={
            variant === "previous" || variant === "both"
              ? withMode(DEFAULTS, "mixed")
              : undefined
          }
          previousRaw={{ target: 45 }}
        />,
      );
      pin(<SameSetup config={withMode(DEFAULTS, "short")} />);
    });
  }
}
for (const scenario of [
  "marked",
  "full",
  "failed",
  "unreadable",
  "skipped",
  "not_answered",
  "strengths",
  "fixes",
  "marking",
  "in_review",
  "reviewed",
  "low",
  "incomplete",
  "empty",
  "photo",
  "transcript",
  "edit",
  "disabled",
] as const) {
  for (const singleResult of [false, true]) {
    for (const wide of [false, true]) {
      it(`preserves feedback ${scenario} / single=${singleResult} / wide=${wide}`, () => {
        const current = { ...row };
        if (["failed", "unreadable", "skipped"].includes(scenario))
          current.status = scenario;
        if (["marking", "in_review", "reviewed"].includes(scenario))
          current.check_status = scenario === "marking" ? "pending" : scenario;
        if (scenario === "full") current.mark = 6;
        if (scenario === "not_answered")
          current.feedback = { note: "No answer" };
        if (scenario === "low")
          current.feedback = { confidence: "low", note: "Uncertain." };
        if (scenario === "incomplete")
          current.criteria = row.criteria!.slice(1);
        if (scenario === "empty" || scenario === "photo") {
          current.answer_text = "";
          current.feedback = {};
        }
        if (scenario === "transcript")
          current.transcript = "Demand grew.\n\nWages lagg[?].";
        state.values = [
          null,
          {
            quote: "",
            start: null,
            kind: "fix",
            tag: "Knowledge",
            body: "",
            next_mark: null,
          },
          scenario === "strengths"
            ? "strength"
            : scenario === "fixes"
              ? "fix"
              : "all",
          null,
          null,
          null,
          scenario === "photo" ? "photo" : "typed",
          wide,
        ];
        pin(
          <AnnotatedFeedback
            row={current}
            singleResult={singleResult}
            readOnly={scenario === "failed"}
            showReferences={scenario !== "full"}
            photos={
              scenario === "photo" || scenario === "transcript"
                ? ["/page-1.jpg", "/page-2.jpg"]
                : []
            }
            edit={
              scenario === "edit" || scenario === "disabled"
                ? {
                    comments,
                    nextMark: "Quote CPI.",
                    onChange: () => {},
                    onUndo: () => {},
                    disabled: scenario === "disabled",
                  }
                : undefined
            }
            actions={<button>Action</button>}
          />,
        );
      });
    }
  }
}
it("preserves feedback disclosures", () => {
  pin(
    <FeedbackDetails name="model" title="Model answer">
      <p>Model text.</p>
    </FeedbackDetails>,
  );
});
