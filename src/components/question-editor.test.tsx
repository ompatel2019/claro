import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({ save: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
}));
vi.mock("@/app/admin/content/questions/actions", () => ({
  saveQuestion: mocks.save,
}));
vi.mock("./question-view", () => ({
  QuestionView: () => null,
  QuestionKey: () => null,
}));
vi.mock("./annotated-feedback", () => ({ AnnotatedFeedback: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { QuestionEditor } from "./question-editor";
const topics = [
  { id: "parent", parent_id: null, name: "Economics", sort: 1 },
  { id: "child", parent_id: "parent", name: "Inflation", sort: 2 },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ error: "Could not save" });
});
afterEach(cleanup);
const loaded = {
  question: {
    id: "imported-question",
    type: "short",
    topic_id: "child",
    marks: 4,
    verb: null,
    source: "Synthetic import",
    year: 2026,
    stem: "Imported question",
    stimulus: null,
    options: null,
    correct_index: null,
    explanation: null,
    criteria: [],
    guideline_notes: null,
    sample_answer: null,
    status: "draft",
    origin: "claro",
    duplicate_of: null,
    updated_at: "2026-10-10T00:00:00Z",
  },
  attemptCount: 0,
  duplicate: null,
  stats: {
    id: "imported-question",
    histogram: [],
    picks: { rates: [], flagged: false, picks: 0 },
    attempts: 0,
    avg: null,
    disagreements: 0,
    reports: [],
    reportCount: 0,
  },
  recentAnswers: [],
} as React.ComponentProps<typeof QuestionEditor>["loaded"];
const mount = () => render(<QuestionEditor loaded={loaded} topics={topics} />);
it("keeps a pristine question unsaved and hides validation until a save attempt", () => {
  mount();
  expect(screen.getByText("Saved · ⌘S")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Stem"), {
    target: { value: "Explain inflation" },
  });
  expect(screen.getByText("Unsaved changes · ⌘S")).toBeInTheDocument();
  expect(screen.queryByText("Add at least one band.")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  expect(screen.getByText("Add at least one band.")).toBeInTheDocument();
});
it("shows band validation after editing criteria and clears it when corrected", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Add band" }));
  expect(screen.getByLabelText("Band 1 descriptor")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  fireEvent.change(screen.getByLabelText("Band 1 min"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Band 1 descriptor"), {
    target: { value: "Explains inflation" },
  });
  expect(screen.getByLabelText("Band 1 descriptor")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove band 1" }));
  expect(screen.getByText("Add at least one band.")).toBeInTheDocument();
});
it("only shows Saved after a successful save, allowing retry after failure", async () => {
  mocks.save
    .mockResolvedValueOnce({ error: "Couldn’t save. Try again." })
    .mockResolvedValueOnce({
      id: "new-question",
      updated_at: "2026-10-10T00:00:00Z",
    });
  mount();
  fireEvent.change(screen.getByLabelText("ID"), {
    target: { value: "new-question" },
  });
  fireEvent.change(screen.getByLabelText("Source label"), {
    target: { value: "Claro" },
  });
  fireEvent.change(screen.getByLabelText("Stem"), {
    target: { value: "Explain inflation" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Subtopic" }));
  {
    const option = await screen.findByRole("option", {
      name: "Inflation",
    });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await screen.findByText("Couldn’t save. Try again.");
  expect(screen.queryByText("Saved · ⌘S")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /^Save$/ }));
  await waitFor(() =>
    expect(screen.getByText("Saved · ⌘S")).toBeInTheDocument(),
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("prevents an open dropdown from editing the question during a keyboard save", async () => {
  let finishSave!: (result: { id: string; updated_at: string }) => void;
  mocks.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  mount();
  fireEvent.change(screen.getByLabelText("ID"), {
    target: { value: "new-question" },
  });
  fireEvent.change(screen.getByLabelText("Source label"), {
    target: { value: "Claro" },
  });
  fireEvent.change(screen.getByLabelText("Stem"), {
    target: { value: "Explain inflation" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Subtopic" }));
  const topic = await screen.findByRole("option", {
    name: "Inflation",
  });
  fireEvent.pointerDown(topic, { pointerType: "mouse" });
  fireEvent.click(topic);
  fireEvent.click(screen.getByRole("combobox", { name: "Status" }));
  const live = await screen.findByRole("option", { name: "Live" });
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  fireEvent.pointerDown(live, { pointerType: "mouse" });
  fireEvent.click(live);
  finishSave({ id: "new-question", updated_at: "2026-10-10T00:00:00Z" });
  await screen.findByText("Saved · ⌘S");
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
    "Draft",
  );
});

it("shows only the selected topic's subtopics and clears a previous subtopic on parent change", async () => {
  render(
    <QuestionEditor
      loaded={loaded}
      topics={[
        ...topics,
        { id: "other", parent_id: null, name: "Other topic", sort: 2 },
        {
          id: "other-child",
          parent_id: "other",
          name: "Other subtopic",
          sort: 1,
        },
      ]}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent(
    "1. Economics",
  );
  expect(screen.getByRole("combobox", { name: "Subtopic" })).toHaveTextContent(
    "Inflation",
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  const parent = await screen.findByRole("option", { name: "2. Other topic" });
  fireEvent.pointerDown(parent, { pointerType: "mouse" });
  fireEvent.click(parent);
  expect(screen.getByRole("combobox", { name: "Subtopic" })).toHaveTextContent(
    "Choose a subtopic",
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Subtopic" }));
  expect(
    await screen.findByRole("option", { name: "Other subtopic" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("option", { name: "Inflation" }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  expect(screen.getAllByText("Choose a subtopic.").length).toBeGreaterThan(0);
  expect(mocks.save).not.toHaveBeenCalled();
});

const structuredMc = {
  concept: "Domestic share.",
  why_correct: "Imports fall.",
  distractors: { A: "Tax.", B: "Subsidy.", D: "Quota." },
};
function mountMc(explanation: string) {
  render(
    <QuestionEditor
      loaded={{
        ...loaded,
        question: {
          ...loaded.question,
          type: "mcq",
          marks: 1,
          options: ["A", "B", "C", "D"],
          correct_index: 2,
          explanation,
        },
      }}
      topics={topics}
    />,
  );
}
it("edits structured MC explanations through named fields and serialises the same contract", async () => {
  mountMc(JSON.stringify(structuredMc));
  expect(screen.getByLabelText("Concept")).toHaveValue("Domestic share.");
  expect(
    screen.queryByLabelText("Why option C is wrong"),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Concept"), {
    target: { value: "New concept." },
  });
  fireEvent.change(screen.getByLabelText("Why option A is wrong"), {
    target: { value: "New note." },
  });
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(JSON.parse(mocks.save.mock.calls[0][0].explanation)).toEqual({
    ...structuredMc,
    concept: "New concept.",
    distractors: { ...structuredMc.distractors, A: "New note." },
  });
});
it("publishes after clearing a distractor note and making that option correct", async () => {
  mocks.save.mockResolvedValueOnce({
    id: loaded.question.id,
    updated_at: "2026-10-14T00:00:00Z",
  });
  mountMc(JSON.stringify(structuredMc));
  fireEvent.change(screen.getByLabelText("Why option A is wrong"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "A is correct" }));
  expect(
    screen.queryByLabelText("Why option A is wrong"),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Why option C is wrong"), {
    target: { value: "C note." },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Status" }));
  const live = await screen.findByRole("option", { name: "Live" });
  fireEvent.pointerDown(live, { pointerType: "mouse" });
  fireEvent.click(live);
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await screen.findByText("Saved · ⌘S");
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const saved = mocks.save.mock.calls[0][0];
  expect(saved.status).toBe("live");
  expect(saved.correct_index).toBe(0);
  expect(JSON.parse(saved.explanation)).toEqual({
    ...structuredMc,
    distractors: { B: "Subsidy.", C: "C note.", D: "Quota." },
  });
});
it("drops an existing correct-option note when serialising a saved explanation", async () => {
  mountMc(
    JSON.stringify({
      ...structuredMc,
      distractors: { ...structuredMc.distractors, C: "Stale note." },
    }),
  );
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  expect(JSON.parse(mocks.save.mock.calls[0][0].explanation)).toEqual(
    structuredMc,
  );
});
it("converts legacy prose without losing it and restores incomplete drafts as fields", () => {
  mountMc("Existing reasoning.");
  expect(screen.getByLabelText("Explanation")).toHaveValue(
    "Existing reasoning.",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Use concept-first explanation" }),
  );
  expect(screen.getByLabelText("Why the correct answer follows")).toHaveValue(
    "Existing reasoning.",
  );
  expect(screen.getByLabelText("Concept")).toHaveValue("");
  cleanup();
  mountMc(
    JSON.stringify({
      concept: "",
      why_correct: "Existing reasoning.",
      distractors: {},
    }),
  );
  expect(screen.getByLabelText("Concept")).toHaveValue("");
  expect(screen.getByLabelText("Why option D is wrong")).toHaveValue("");
});
