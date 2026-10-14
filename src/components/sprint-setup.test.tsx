import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const start = () =>
  screen.getByRole("button", { name: /^Start (sprint|with)/ });
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: pool, error: null });
  mocks.start.mockResolvedValue({ error: "Try again." });
});
afterEach(cleanup);
it("shows one step at a time, blocks early starts, preserves choices on Back and resets", async () => {
  render(<SprintSetup topics={topics} params={{}} />);
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  expect(start()).toBeDisabled();
  expect(screen.queryByRole("region", { name: "Topics" })).toBeNull();
  fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  next();
  fireEvent.click(screen.getByRole("button", { name: /Topic 1/ }));
  next();
  expect(screen.getByRole("textbox", { name: "Marks" })).toHaveValue("30");
  fireEvent.change(screen.getByRole("textbox", { name: "Marks" }), {
    target: { value: "45" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  next();
  expect(screen.getByRole("textbox", { name: "Marks" })).toHaveValue("45");
  next();
  expect(screen.getByText("Step 4 of 4")).toBeVisible();
  expect(start()).toBeEnabled();
  expect(
    screen.queryByRole("radiogroup", { name: "Question history" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  expect(
    screen.getByRole("radiogroup", { name: "Question history" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByText("Step 1 of 4")).toBeVisible();
  expect(start()).toBeDisabled();
});
it("caps topics at two and handles malformed saved JSON", () => {
  localStorage.setItem("claro.sprint.v1", "{");
  render(<SprintSetup topics={topics} params={{}} />);
  next();
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
it("empty pools block start on the final step and provide a widening action", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ...pool, questions: 0, any: 10 },
    error: null,
  });
  render(<SprintSetup topics={[]} params={{ history: "flagged" }} />);
  next();
  next();
  next();
  await waitFor(() =>
    expect(screen.getByText("No questions match")).toBeVisible(),
  );
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
  next();
  next();
  next();
  await waitFor(() =>
    expect(
      screen.getByText("Couldn't count matching questions."),
    ).toBeVisible(),
  );
  fireEvent.click(start());
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t start the sprint/)).toBeVisible(),
  );
  expect(screen.getByText("Step 4 of 4")).toBeVisible();
});

it("reselecting the current type after Back keeps its size unit and count", () => {
  render(<SprintSetup topics={[]} params={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  next();
  next();
  fireEvent.click(screen.getByRole("button", { name: "Questions" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Questions" }), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
  next();
  next();
  expect(screen.getByRole("textbox", { name: "Questions" })).toHaveValue("8");
});

it("mixed inputs stay linked at boundaries and reset to an even split for a preset", () => {
  render(<SprintSetup topics={[]} params={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "Mixed" }));
  next();
  next();
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
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  next();
  expect(shorts).toHaveValue(5);
});
it("mixed availability warns per bucket even when combined marks exceed the total", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ...pool, marks: 100, mcq_questions: 2, short_marks: 98 },
    error: null,
  });
  render(<SprintSetup topics={[]} params={{ type: "mixed", size: "30" }} />);
  next();
  next();
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
  next();
  next();
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Multiple choice questions" }),
    { target: { value: "20" } },
  );
  next();
  await waitFor(() =>
    expect(screen.getByText("No questions match")).toBeVisible(),
  );
  expect(start()).toBeDisabled();
});
