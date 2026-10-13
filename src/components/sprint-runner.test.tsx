import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Attempt, Session } from "@/lib/practice";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  update: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  ensureSession: vi.fn(),
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: mocks.update,
      eq() {
        return this;
      },
      is: async () => ({ error: null }),
      in() {
        return this;
      },
      select: async () => ({ data: [{ id: "a" }], error: null }),
    }),
  }),
}));
vi.mock("./session-shell", () => ({
  isTyping: () => false,
  SessionShell: ({
    booklet,
    children,
    onExit,
  }: {
    booklet: React.ReactNode;
    children: React.ReactNode;
    onExit: () => void;
  }) => (
    <>
      <button onClick={onExit}>Save and exit</button>
      {booklet}
      {children}
    </>
  ),
}));
import { SprintRunner } from "./sprint-runner";
const session = {
  id: "s",
  kind: "sprint",
  config: { mode: "mcq", feedback: "each" },
  elapsed_s: 0,
} as Session;
const attempt = {
  id: "a",
  question_id: "q",
  position: 1,
  status: "pending",
  choice_index: 0,
  answer_text: null,
  transcript: null,
  image_paths: null,
  flagged: false,
  mark: null,
  max_marks: null,
  band: null,
  feedback: null,
  question: {
    id: "q",
    type: "mcq",
    marks: 1,
    stem: "What is inflation?",
    options: ["Price increases", "Price decreases"],
    topic_id: "t",
    source: "HSC",
    stimulus: null,
    year: null,
  },
} satisfies Attempt;
function show(initial: Attempt[] = [attempt], config = session.config) {
  mocks.update.mockReturnThis();
  return render(
    <SprintRunner
      session={{ ...session, config }}
      initial={initial}
      userId="u"
      title="Sprint"
    />,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("checks an MC sprint answer and renders its feedback", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      status: "marked",
      mark: 1,
      max_marks: 1,
      feedback: { correct_index: 0 },
      explanation: "Prices rise.",
    }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByText("Correct")).toBeVisible();
  expect(screen.getByText("Prices rise.")).toBeVisible();
  expect(mocks.fetch).toHaveBeenCalledWith(
    "/api/attempts/a/mark",
    expect.objectContaining({ method: "POST" }),
  );
});
it("persists sprint time on save and exit, and keeps the finish confirmation", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(
    await screen.findByRole("dialog", { name: "Finish and mark?" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/student"));
  expect(mocks.update).toHaveBeenCalledWith({ elapsed_s: 0 });
});

it.each(["finish", "overtime"])(
  "expiry warns once without submitting an old %s session",
  async (on_timeout) => {
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "Audio",
      class {
        play = play;
        pause = vi.fn();
      },
    );
    vi.stubGlobal("fetch", mocks.fetch);
    const props = {
      session: {
        ...session,
        elapsed_s: 60,
        config: { ...session.config, time_limit_s: 60, on_timeout },
      } as Session,
      initial: [attempt],
      userId: "u",
      title: "Sprint",
    };
    const view = render(<SprintRunner {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Time’s up");
    expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
    expect(play).toHaveBeenCalledTimes(1);
    view.rerender(<SprintRunner {...props} />);
    expect(play).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  },
);
it("untimed sessions never warn", () => {
  show();
  expect(screen.queryByText(/Time’s up/)).not.toBeInTheDocument();
});

it("flags from the answer actions and updates the question booklet", async () => {
  show();
  const actions = screen.getByRole("group", { name: "Answer actions" });
  expect(
    within(actions).getByRole("button", { name: "Check answer" }),
  ).toBeVisible();
  const flag = within(actions).getByRole("button", { name: "Flag for review" });
  fireEvent.click(flag);
  await waitFor(() => expect(flag).toHaveAttribute("aria-pressed", "true"));
  expect(
    screen.getByRole("button", { name: "Question 1: Answered, Flagged" }),
  ).toBeVisible();
  expect(mocks.update).toHaveBeenCalledWith({ flagged: true });
  fireEvent.click(flag);
  await waitFor(() => expect(flag).toHaveAttribute("aria-pressed", "false"));
});
it("rolls back a flag when saving fails", async () => {
  mocks.update.mockImplementationOnce(() => {
    throw new Error("Could not save flag");
  });
  show();
  const flag = screen.getByRole("button", { name: "Flag for review" });
  fireEvent.click(flag);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not save flag",
  );
  expect(flag).toHaveAttribute("aria-pressed", "false");
});
it("keeps flagging locked for a checked answer", () => {
  render(
    <SprintRunner
      session={session}
      initial={[{ ...attempt, status: "marked", mark: 1 }]}
      userId="u"
      title="Sprint"
    />,
  );
  expect(
    screen.getByRole("button", { name: "Flag for review" }),
  ).toBeDisabled();
});

const nextAttempt = { ...attempt, id: "a2", question_id: "q2", position: 2 };
it("highlights an unchecked answer and warns on Next focus without blocking navigation", async () => {
  show([attempt, nextAttempt]);
  const check = screen.getByRole("button", { name: "Check answer" });
  expect(check).toHaveAccessibleDescription("You have an unchecked answer.");
  const next = screen.getByRole("button", { name: "Next question" });
  next.focus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "check it first?",
  );
  fireEvent.click(next);
  await waitFor(() => expect(screen.getByText(/Question 2 ·/)).toBeVisible());
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it.each(["blank", "checked", "end"])(
  "does not warn for %s answers",
  (state) => {
    const a =
      state === "blank"
        ? { ...attempt, choice_index: null }
        : state === "checked"
          ? { ...attempt, status: "marked", mark: 1 }
          : attempt;
    show([a, nextAttempt], {
      ...session.config,
      feedback: state === "end" ? "end" : "each",
    });
    const check = screen.queryByRole("button", { name: "Check answer" });
    if (check)
      expect(check).not.toHaveAccessibleDescription(
        "You have an unchecked answer.",
      );
    expect(screen.getByRole("button", { name: "Next question" })).toBeVisible();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  },
);
it("keeps the reminder after a marking error and lets the student retry", async () => {
  mocks.fetch.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: "Marking is paused." }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show([attempt, nextAttempt]);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Marking is paused.",
  );
  expect(
    screen.getByRole("button", { name: "Check answer" }),
  ).toHaveAccessibleDescription("You have an unchecked answer.");
  expect(screen.getByRole("button", { name: "Next question" })).toBeEnabled();
});
it("keyboard checking ignores empty answers and never runs twice while checking", async () => {
  vi.stubGlobal("fetch", mocks.fetch);
  show([{ ...attempt, choice_index: null }]);
  fireEvent.keyDown(window, { ctrlKey: true, key: "Enter" });
  expect(mocks.fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("radio", { name: /^Option A:/ }));
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  fireEvent.keyDown(window, { ctrlKey: true, key: "Enter" });
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  fireEvent.keyDown(window, { ctrlKey: true, key: "Enter" });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it("a failed manual finish keeps the saved answer editable and allows retry", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  mocks.fetch.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: "Marking is paused. Try again." }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish and mark" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Marking is paused.",
  );
  expect(
    screen.queryByRole("heading", { name: "Marking your answers" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /^Option A:/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
});
