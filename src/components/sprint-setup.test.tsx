import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), start: vi.fn() }));
vi.mock("@/app/(app)/actions", () => ({ startSprint: mocks.start }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));
import { SprintSetup } from "./sprint-setup";
const topics = [1, 2, 3].map((i) => ({
  id: `t${i}`,
  parent_id: null,
  name: `Topic ${i}`,
  sort: i,
}));
const pool = {
  questions: 30,
  marks: 45,
  any: 30,
  new: 30,
  mistakes: 0,
  flagged: 0,
  topics: {},
  subtopics: {},
  all_subtopics: 30,
  verbs: {},
  difficulty: {},
  all_years: 30,
  years: [2020, 2025],
  trial: true,
};
const start = () =>
  screen.getByRole("button", { name: /^Start (sprint|with)/ });
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: pool, error: null });
  mocks.start.mockResolvedValue({ error: "Try again." });
});
afterEach(cleanup);
it("keeps the live summary after the builder with warnings and controls", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ...pool, marks: 10, questions: 4, new: 4 },
    error: null,
  });
  render(<SprintSetup topics={topics} params={{ type: "short" }} />);
  const form = start().closest("form")!;
  const card = screen
    .getByRole("region", { name: "Question type" })
    .closest('[data-slot="card"]')!;
  expect(card.parentElement).toBe(form.parentElement);
  expect(card.nextElementSibling).toBe(form);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Only 10 marks match"),
  );
  expect(form).toContainElement(screen.getByRole("alert"));
  expect(form).toHaveTextContent("30 marks · 45 min");
  expect(form).toHaveTextContent("4 questions match · 4 new");
  expect(form).toContainElement(screen.getByRole("button", { name: "Reset" }));
  expect(start()).toBeEnabled();
});
it("shows all builder sections, preserves settings across type selection, and resets", async () => {
  render(<SprintSetup topics={topics} params={{}} />);
  for (const name of ["Question type", "Topics", "Size", "Timer", "Feedback"])
    expect(screen.getByRole("region", { name })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  fireEvent.click(screen.getByRole("button", { name: /Topic 1/ }));
  const marks = screen.getByRole("textbox", { name: "Marks" });
  expect(marks).toHaveValue("30");
  fireEvent.change(marks, { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  expect(marks).toHaveValue("45");
  expect(start()).toBeEnabled();
  expect(
    screen.queryByRole("radiogroup", { name: "Question history" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  expect(
    screen.getByRole("radiogroup", { name: "Question history" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(
    screen.getByRole("button", { name: "Multiple choice" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Topic 1/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("textbox", { name: "Questions" })).toHaveValue("20");
});
it("caps topics at two and handles malformed saved JSON", () => {
  localStorage.setItem("claro.sprint.v1", "{");
  render(<SprintSetup topics={topics} params={{}} />);
  for (const i of [1, 2, 3])
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`Topic ${i}`) }),
    );
  expect(screen.getByText("Up to 2 topics. Deselect one first.")).toBeVisible();
  expect(screen.getByRole("button", { name: /Topic 3/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
it("empty pools keep the summary after the builder, block start and provide a widening action", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ...pool, questions: 0, any: 10 },
    error: null,
  });
  render(<SprintSetup topics={[]} params={{ history: "flagged" }} />);
  await waitFor(() =>
    expect(screen.getByText("No questions match")).toBeVisible(),
  );
  const card = screen
    .getByRole("region", { name: "Question type" })
    .closest('[data-slot="card"]')!;
  expect(card.nextElementSibling).toBe(start().closest("form"));
  expect(start()).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Include seen questions (+10)" }),
  );
  await waitFor(() =>
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_config.history).toBe("any"),
  );
});
it("reports count and start failures without losing the settings", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "unavailable" },
  });
  render(<SprintSetup topics={[]} params={{}} />);
  await waitFor(() =>
    expect(
      screen.getByText("Couldn't count matching questions."),
    ).toBeVisible(),
  );
  fireEvent.click(start());
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t start the sprint/)).toBeVisible(),
  );
  expect(screen.getByRole("region", { name: "Question type" })).toBeVisible();
});

it("reselecting the current type keeps its size unit and count", () => {
  render(<SprintSetup topics={[]} params={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Questions" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Questions" }), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  expect(screen.getByRole("textbox", { name: "Questions" })).toHaveValue("8");
});

it("mixed inputs stay linked at boundaries and reset to an even split for a preset", () => {
  render(<SprintSetup topics={[]} params={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "Mixed" }));
  const mc = screen.getByRole("spinbutton", {
    name: "Multiple choice questions",
  });
  const shorts = screen.getByRole("spinbutton", { name: "Short answer marks" });
  expect(mc).toHaveValue(23);
  expect(shorts).toHaveValue(22);
  fireEvent.change(mc, { target: { value: "0" } });
  expect(shorts).toHaveValue(45);
  fireEvent.change(shorts, { target: { value: "999" } });
  expect(mc).toHaveValue(0);
  expect(shorts).toHaveValue(45);
  fireEvent.click(screen.getByRole("button", { name: "30" }));
  expect(mc).toHaveValue(15);
  expect(shorts).toHaveValue(15);
  fireEvent.change(shorts, { target: { value: "5" } });
  expect(mc).toHaveValue(25);
  expect(
    screen.getByText("25 multis + 5 marks of shorts = 30 marks"),
  ).toBeVisible();
  expect(shorts).toHaveValue(5);
});
it("mixed availability warns per bucket even when combined marks exceed the total", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ...pool, marks: 100, mcq_questions: 2, short_marks: 98 },
    error: null,
  });
  render(<SprintSetup topics={[]} params={{ type: "mixed", size: "30" }} />);
  await waitFor(() =>
    expect(
      screen.getByText(/Only 2 multis and 98 marks of shorts match/),
    ).toBeVisible(),
  );
});

it("an empty requested bucket disables start even when the other type has questions", async () => {
  mocks.rpc.mockResolvedValue({
    data: {
      ...pool,
      questions: 3,
      mcq_questions: 0,
      mcq_new: 0,
      short_marks: 17,
    },
    error: null,
  });
  render(<SprintSetup topics={[]} params={{ type: "mixed", size: "20" }} />);
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Multiple choice questions" }),
    { target: { value: "20" } },
  );
  await waitFor(() =>
    expect(screen.getByText("No questions match")).toBeVisible(),
  );
  expect(start()).toBeDisabled();
});

it("keeps a five-mark Mixed total on blur and explains the minimum inline", () => {
  render(<SprintSetup topics={[]} params={{ type: "mixed" }} />);
  const marks = screen.getByRole("textbox", { name: "Marks" });
  fireEvent.change(marks, { target: { value: "5" } });
  fireEvent.blur(marks);
  expect(marks).toHaveValue("5");
  expect(marks).toHaveAccessibleDescription(/Minimum 5 marks/);
  expect(
    screen.getByRole("spinbutton", { name: "Multiple choice questions" }),
  ).toHaveValue(3);
  fireEvent.change(marks, { target: { value: "1" } });
  expect(screen.getByText(/Enter 5–100 marks/)).toBeVisible();
  fireEvent.blur(marks);
  expect(marks).toHaveValue("1");
  expect(start()).toBeDisabled();
});

it("stores the existing feedback values through the feedback cards", async () => {
  render(<SprintSetup topics={[]} params={{}} />);
  const exam = screen.getByRole("radio", { name: /^Exam mode/ });
  const check = screen.getByRole("radio", {
    name: /^Check as I go/,
  });
  expect(exam).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("Check each answer when you’re ready.").tagName).toBe(
    "LI",
  );
  fireEvent.click(check);
  expect(check).toHaveAttribute("aria-checked", "true");
  expect(
    JSON.parse(
      (document.querySelector('input[name="config"]') as HTMLInputElement)
        .value,
    ).feedback,
  ).toBe("each");
  expect(screen.getByRole("radio", { name: /^Check as I go/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  fireEvent.click(screen.getByRole("radio", { name: /^Exam mode/ }));
  expect(
    JSON.parse(
      (document.querySelector('input[name="config"]') as HTMLInputElement)
        .value,
    ).feedback,
  ).toBe("end");
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem("claro.sprint.v1")!).feedback).toBe(
      "end",
    ),
  );
});

it("selects a dot point with its parent, enforces the topic limit and clears both", async () => {
  const dotPoints = topics.map((topic) => ({
    id: `${topic.id}-1`,
    parent_id: topic.id,
    name: `${topic.name} dot point`,
    sort: 1,
  }));
  mocks.rpc.mockResolvedValue({
    data: {
      ...pool,
      subtopics: Object.fromEntries(dotPoints.map((t) => [t.id, 5])),
    },
    error: null,
  });
  render(<SprintSetup topics={[...topics, ...dotPoints]} params={{}} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Topic 1 dot point · 5" }),
    ).toBeEnabled(),
  );
  const config = () =>
    JSON.parse(
      (document.querySelector('input[name="config"]') as HTMLInputElement)
        .value,
    );
  for (const i of [1, 2, 3])
    fireEvent.click(
      screen.getByRole("button", { name: `Topic ${i} dot point · 5` }),
    );
  expect(config().topics).toEqual(["t1", "t2"]);
  expect(config().subtopics).toEqual(["t1-1", "t2-1"]);
  expect(screen.getByText("Up to 2 topics. Deselect one first.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(config().topics).toEqual([]);
  expect(config().subtopics).toEqual([]);
});

it.each(["mistakes", "new_only", "flagged"])(
  "preserves the advanced %s history without a conflicting switch",
  async (history) => {
    render(<SprintSetup topics={topics} params={{ type: "short", history }} />);
    await screen.findByText("Last 5 years");
    expect(
      screen.queryByRole("switch", { name: /Prefer questions/ }),
    ).not.toBeInTheDocument();
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_config.history).toBe(history);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    const selected = within(
      screen.getByRole("radiogroup", { name: "Question history" }),
    )
      .getAllByRole("radio")
      .find((r) => r.getAttribute("aria-checked") === "true");
    expect(selected).toBeDefined();
    expect(
      JSON.parse(
        (document.querySelector('input[name="config"]') as HTMLInputElement)
          .value,
      ).history,
    ).toBe(history);
  },
);
it("toggles prefer-new only for the compatible history choices", async () => {
  render(
    <SprintSetup topics={topics} params={{ type: "short", history: "any" }} />,
  );
  const toggle = await screen.findByRole("switch", {
    name: /Prefer questions/,
  });
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_config.history).toBe(
      "prefer_new",
    ),
  );
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(mocks.rpc.mock.calls.at(-1)?.[1].p_config.history).toBe("any"),
  );
});
it("gives both feedback options a visible keyboard-focus ring", () => {
  render(<SprintSetup topics={topics} params={{}} />);
  for (const radio of within(
    screen.getByRole("region", { name: "Feedback" }),
  ).getAllByRole("radio")) {
    expect(radio.closest("label")).toHaveClass(
      "has-[:focus-visible]:ring-2",
      "has-[:focus-visible]:ring-ring",
    );
  }
});
it("summarises a whole topic alongside the other topic's selected subtopic", () => {
  render(
    <SprintSetup
      topics={[
        ...topics,
        { id: "t1-a", parent_id: "t1", name: "Dot point A", sort: 1 },
      ]}
      params={{ topics: "t1,t2", sub: "t1-a" }}
    />,
  );
  const summary = start().closest("form")!;
  expect(within(summary).getByText("Topic 1", { exact: true })).toBeVisible();
  expect(
    within(summary).getByText("Dot point A", { exact: true }),
  ).toBeVisible();
  expect(within(summary).getByText("Topic 2", { exact: true })).toBeVisible();
});
