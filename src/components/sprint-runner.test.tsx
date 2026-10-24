import {
  cleanup,
  act,
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
  upload: vi.fn(),
  remove: vi.fn().mockResolvedValue({ error: null }),
  scan: vi.fn(),
}));
vi.mock("@/hooks/use-scan-to-text", () => ({
  useScanToText: () => ({
    scan: mocks.scan,
    state: "idle",
    error: "",
    retryAt: 0,
    cancel: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  ensureSession: vi.fn(),
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
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
}));
vi.mock("./student/sprint/focus-shell", () => ({
  SprintFocusShell: ({
    booklet,
    progress,
    children,
    onExit,
  }: {
    booklet: React.ReactNode;
    progress: React.ReactNode;
    children: React.ReactNode;
    onExit: () => void;
  }) => (
    <>
      <button onClick={onExit}>Exit sprint</button>
      {booklet}
      <nav aria-label="Question progress">{progress}</nav>
      {children}
    </>
  ),
}));
import { SprintRunner } from "./sprint-runner";
import { questionPillState } from "./student/sprint/question-pill";
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
  vi.useRealTimers();
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
const finishCall = () =>
  expect(mocks.fetch).toHaveBeenCalledWith(
    "/api/sessions/s/finish",
    expect.objectContaining({ method: "POST" }),
  );
async function leave() {
  fireEvent.click(screen.getByRole("button", { name: "Exit sprint" }));
  const dialog = await screen.findByRole("alertdialog", {
    name: "Leave this sprint?",
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Leave and mark" }),
  );
  await waitFor(finishCall);
}
it("exit asks first, and leaving saves time and finishes the sprint", async () => {
  vi.stubGlobal("fetch", mocks.fetch);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Finish and mark" }));
  expect(
    await screen.findByRole("dialog", { name: "Finish and mark?" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
  fireEvent.click(screen.getByRole("button", { name: "Exit sprint" }));
  const dialog = await screen.findByRole("alertdialog", {
    name: "Leave this sprint?",
  });
  expect(dialog).toHaveTextContent(
    "Leaving ends this sprint. Your answered questions will be marked.",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep working" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
  await leave();
  expect(mocks.update).toHaveBeenCalledWith({ elapsed_s: 0 });
  expect(mocks.push).not.toHaveBeenCalled();
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

it("flags from the fixed footer and updates the question booklet", async () => {
  show();
  const actions = screen.getByRole("group", { name: "Answer actions" });
  expect(
    within(actions).getByRole("button", { name: "Check answer" }),
  ).toBeVisible();
  const flag = screen.getByRole("button", { name: "Flag for review" });
  fireEvent.click(flag);
  await waitFor(() => expect(flag).toHaveAttribute("aria-pressed", "true"));
  expect(
    within(
      screen.getByRole("navigation", { name: "Question booklet" }),
    ).getByRole("button", { name: "Question 1: Answered, Flagged" }),
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
it("highlights an unchecked answer and warns on keyboard focus without blocking navigation", async () => {
  show([attempt, nextAttempt]);
  const check = screen.getByRole("button", { name: "Check answer" });
  expect(check).toHaveAccessibleDescription("You have an unchecked answer.");
  const next = screen.getByRole("button", { name: "Next question" });
  expect(next).toBeEnabled();
  act(() => next.focus());
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "check it first?",
  );
  fireEvent.click(next);
  await waitFor(() => expect(screen.getByText("Question 2")).toBeVisible());
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

function written() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  return {
    ...attempt,
    choice_index: null,
    answer_text: "Demand grows.",
    transcript: null,
    image_paths: null,
    question: { ...attempt.question, type: "short" as const, marks: 4 },
  };
}
it("renders full written comments and an outline inline with one mark request", async () => {
  const a = written();
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      status: "marked",
      mark: 2,
      max_marks: 4,
      band: "Sound",
      feedback: {
        comments: [
          {
            quote: "Demand",
            start: 0,
            kind: "strength",
            tag: "Knowledge",
            body: "You identified demand.",
            next_mark: null,
          },
          {
            quote: "missing",
            start: 30,
            kind: "fix",
            tag: "Analysis",
            body: "Link demand to prices.",
            next_mark: "Explain spare capacity.",
          },
        ],
        better_answer_outline: [
          "Define demand-pull inflation.",
          "Explain price pressure.",
        ],
      },
    }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show([a]);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  const feedback = await screen.findByRole("region", {
    name: "Checked answer feedback",
  });
  expect(within(feedback).getByLabelText("Your mark: 2/4")).toBeVisible();
  expect(
    within(feedback).getByRole("button", {
      name: "Your next mark: Explain spare capacity.",
    }),
  ).toBeVisible();
  expect(
    within(feedback).getByRole("button", { name: /^Strength 1/ }),
  ).toBeVisible();
  expect(within(feedback).getByText("Overall")).toBeVisible();
  expect(
    within(feedback).getByText("Define demand-pull inflation."),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Full feedback in your results."),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("textbox", { name: "Your answer" }),
  ).not.toBeInTheDocument();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it("shows the model answer from a written check, and no guidelines or review notes", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      status: "marked",
      mark: 2,
      max_marks: 4,
      band: "Sound",
      feedback: { comments: [] },
      sample_answer: "Synthetic model answer.",
    }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show([written()]);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  const feedback = await screen.findByRole("region", {
    name: "Checked answer feedback",
  });
  expect(within(feedback).getByText("Sample answer")).toBeVisible();
  expect(
    within(feedback).getByText("Synthetic model answer."),
  ).toBeInTheDocument();
  expect(
    within(feedback).queryByText("Marking guidelines"),
  ).not.toBeInTheDocument();
  expect(
    within(feedback).queryByText(/double-checking/),
  ).not.toBeInTheDocument();
});
it("a resumed written check keeps its model answer", () => {
  show([
    {
      ...written(),
      status: "marked",
      mark: 3,
      max_marks: 4,
      feedback: { comments: [] },
      sample_answer: "Synthetic model answer.",
    },
  ]);
  expect(
    screen.getByRole("region", { name: "Checked answer feedback" }),
  ).toHaveTextContent("Sample answer");
});
it("resumed written marks render existing feedback without marking again", () => {
  const a = {
    ...written(),
    status: "marked",
    mark: 4,
    max_marks: 4,
    feedback: { comments: [] },
  };
  show([a]);
  expect(
    screen.getByRole("region", { name: "Checked answer feedback" }),
  ).toHaveTextContent("4/4");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("a failed written check retains the answer and offers retry", async () => {
  mocks.fetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: "Could not mark answer" }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show([written()]);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not mark answer",
  );
  expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "Demand grows.",
  );
  expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
});

it("locks the written answer while its single check is running", async () => {
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", mocks.fetch);
  show([written()]);
  expect(
    screen.queryByRole("button", { name: "Submit answer" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox", { name: "Your answer" })).toBeDisabled();
});

it("allows Next during checking but disables another check until it finishes", async () => {
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", mocks.fetch);
  show([attempt, nextAttempt]);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  await waitFor(() => expect(screen.getByText("Question 2")).toBeVisible());
  expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
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
  fireEvent.click(screen.getByRole("button", { name: "Finish and mark" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish and mark" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Marking is paused.",
  );
  expect(
    screen.queryByRole("heading", { name: "Marking your answers" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /^Option A:/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Finish and mark" })).toBeEnabled();
});

it("shows structured MC feedback concept first and retains it on question navigation", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      status: "marked",
      mark: 0,
      max_marks: 1,
      feedback: { correct_index: 2 },
      explanation: "Legacy fallback",
      structured_explanation: {
        concept: "A local content rule sets a domestic share.",
        why_correct: "Imported inputs fall.",
        distractors: {
          A: "Not a tariff.",
          B: "Not a subsidy.",
          D: "Not a quota.",
        },
      },
    }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show([attempt, nextAttempt]);
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByText("Thus the answer is C.")).toBeVisible();
  expect(screen.getByText("Not a tariff.")).toBeVisible();
  expect(screen.queryByText("Legacy fallback")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  await waitFor(() =>
    expect(screen.queryByText("Not a tariff.")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
  expect(await screen.findByText("Not a tariff.")).toBeVisible();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it("restores a checked MC explanation without another marking request", () => {
  render(
    <SprintRunner
      session={session}
      initial={[
        {
          ...attempt,
          status: "marked",
          mark: 1,
          feedback: { correct_index: 0 },
        },
      ]}
      initialExplanations={{
        a: JSON.stringify({
          concept: "Prices rise.",
          why_correct: "A is the increase.",
          distractors: { B: "A decrease is deflation." },
        }),
      }}
      userId="u"
      title="Sprint"
    />,
  );
  expect(screen.getByText("Thus the answer is A.")).toBeVisible();
  expect(screen.getByText("A decrease is deflation.")).toBeVisible();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("saves before background marking, keeps a resumed mark editable and hides failures", async () => {
  const written: Attempt = {
    ...attempt,
    choice_index: null,
    answer_text: "Original saved answer",
    status: "marked",
    mark: 2,
    max_marks: 4,
    question: { ...attempt.question, type: "short", marks: 4 },
  };
  mocks.fetch.mockImplementation(
    async (_url: string, options: RequestInit) => ({
      ok: options.method === "PATCH",
      status: options.method === "PATCH" ? 200 : 500,
      json: async () => ({ saved: true }),
    }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
  show([written, { ...attempt, id: "b", question_id: "qb", position: 2 }], {
    ...session.config,
    feedback: "end",
  });
  const box = screen.getByRole("textbox", { name: "Your answer" });
  expect(box).toBeEnabled();
  fireEvent.change(box, { target: { value: "Edited final answer" } });
  expect(
    within(
      screen.getByRole("navigation", { name: "Question booklet" }),
    ).getByRole("button", { name: /^Question 1:/ }),
  ).not.toHaveAccessibleName(/marks/);
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Question booklet" }),
    ).getByRole("button", { name: /^Question 2:/ }),
  );
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/attempts/a/mark",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  expect(mocks.fetch.mock.calls[0]).toEqual([
    "/api/attempts/a/mark",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ answer_text: "Edited final answer" }),
    }),
  ]);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Question booklet" }),
    ).getByRole("button", { name: /^Question 1:/ }),
  );
  expect(
    await screen.findByRole("textbox", { name: "Your answer" }),
  ).toHaveValue("Edited final answer");
});

it("Exam mode never shows or announces awarded marks; check mode still does", () => {
  const marked: Attempt = {
    ...written(),
    status: "marked",
    mark: 2,
    max_marks: 4,
  };
  const names = () =>
    ["Question booklet", "Question progress"].flatMap((nav) =>
      within(screen.getByRole("navigation", { name: nav }))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    );
  show([marked], { ...session.config, feedback: "end" });
  expect(names().join(" ")).not.toMatch(/\d+\/\d+|marks/);
  expect(document.body).not.toHaveTextContent(/2\/4|Band|Correct/);
  expect(screen.getByText("4 marks")).toBeVisible();
  cleanup();
  show([marked]);
  expect(
    screen.getByRole("button", { name: "Question 1: Answered, 2/4 marks" }),
  ).toBeVisible();
});

it("Submit answer queues silently and deduplicates repeated submissions", async () => {
  const a = written();
  mocks.fetch.mockImplementation(
    async (_url: string, options: RequestInit) => ({
      ok: options.method === "PATCH",
      status: options.method === "PATCH" ? 200 : 500,
      json: async () => ({ saved: true }),
    }),
  );
  vi.stubGlobal("fetch", mocks.fetch);
  show([a], { ...session.config, feedback: "end" });
  fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeEnabled(),
  );
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Your answer" })).toBeEnabled();
});

it("queues a new photo version even when its transcript is unchanged", async () => {
  const a = { ...written(), image_paths: ["u/first.png"] };
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ saved: true }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show([a], { ...session.config, feedback: "end" });
  fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove page 1" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
  await waitFor(() =>
    expect(
      mocks.fetch.mock.calls.filter(([, options]) => options.method === "POST"),
    ).toHaveLength(2),
  );
});

it.each(["HSC", "2019 HSC"])("shows paper year once for %s", (source) => {
  show([{ ...attempt, question: { ...attempt.question, year: 2019, source } }]);
  expect(screen.getByText("2019 HSC")).toBeVisible();
});
it("renders a question without paper metadata", () => {
  show([
    { ...attempt, question: { ...attempt.question, year: null, source: "" } },
  ]);
  expect(screen.getByText("What is inflation?")).toBeVisible();
  expect(screen.queryByText(/No source|undefined|null/)).toBeNull();
});

it("saves a photo with only accepted answer fields and retries metadata without reuploading", async () => {
  mocks.upload.mockResolvedValue({ error: null });
  let fail = true;
  mocks.fetch.mockImplementation(async (_url, options) => {
    const patch = JSON.parse(options.body);
    // The real PATCH route is strict: status is server-owned.
    const accepted = Object.keys(patch).every((key) =>
      ["answer_text", "transcript", "image_paths", "flagged"].includes(key),
    );
    return {
      ok: accepted && !fail,
      json: async () => ({
        error: accepted ? "Connection lost" : "Invalid answer",
      }),
    };
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show(
    [
      {
        ...attempt,
        choice_index: null,
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: {
      files: [new File(["photo"], "answer.png", { type: "image/png" })],
    },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  const patch = {
    image_paths: [mocks.upload.mock.calls[0][0]],
    answer_text: null,
    transcript: null,
  };
  expect(mocks.fetch.mock.calls[0][0]).toBe("/api/attempts/a/mark");
  expect(mocks.fetch.mock.calls[0][1].method).toBe("PATCH");
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual(patch);
  expect(JSON.parse(localStorage.getItem("claro-draft-a")!)).toEqual(patch);
  expect(screen.getByText("Page 1")).toBeVisible();
  fail = false;
  await leave();
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(localStorage.getItem("claro-draft-a")).toBeNull();
});

it("retries failed photo metadata automatically despite the one-second session clock", async () => {
  vi.useFakeTimers();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.fetch
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Offline" }),
    })
    .mockResolvedValue({ ok: true, json: async () => ({ saved: true }) });
  vi.stubGlobal("fetch", mocks.fetch);
  show(
    [
      {
        ...attempt,
        choice_index: null,
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
      target: {
        files: [new File(["photo"], "answer.png", { type: "image/png" })],
      },
    });
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  for (let second = 0; second < 6; second++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(localStorage.getItem("claro-draft-a")).toBeNull();
});

it("keeps a removed photo until the end-feedback metadata retry succeeds, then deletes it", async () => {
  const path = "u/11111111-1111-4111-8111-111111111111-1729000000000-0.png";
  let fail = true;
  mocks.fetch.mockImplementation(async () => ({
    ok: !fail,
    json: async () => ({ error: "Offline" }),
  }));
  vi.stubGlobal("fetch", mocks.fetch);
  show(
    [
      {
        ...attempt,
        choice_index: null,
        image_paths: [path],
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove page 1" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("claro-draft-a")!)).toEqual({
    image_paths: null,
    transcript: null,
  });
  fail = false;
  await leave();
  expect(mocks.remove).toHaveBeenCalledWith([path]);
});

it("cleans up a pending uploaded photo if its restored metadata draft is replaced", async () => {
  const path = "u/11111111-1111-4111-8111-111111111111-1729000000000-0.png";
  localStorage.setItem(
    "claro-draft-a",
    JSON.stringify({
      image_paths: [path],
      answer_text: null,
      transcript: null,
    }),
  );
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ saved: true }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show(
    [
      {
        ...attempt,
        choice_index: null,
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove page 1" }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith([path]));
  expect(localStorage.getItem("claro-draft-a")).toBeNull();
});

it("deletes a fresh upload when the student removes it after its metadata save fails", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  mocks.upload.mockResolvedValue({ error: null });
  mocks.fetch
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Offline" }),
    })
    .mockResolvedValue({ ok: true, json: async () => ({ saved: true }) });
  vi.stubGlobal("fetch", mocks.fetch);
  show(
    [
      {
        ...attempt,
        id,
        choice_index: null,
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: {
      files: [new File(["photo"], "answer.png", { type: "image/png" })],
    },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove page 1" }));
  await waitFor(() =>
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]),
  );
  expect(localStorage.getItem(`claro-draft-${id}`)).toBeNull();
});

it("scans a written answer into the typed box and saves it as answer_text", async () => {
  window.matchMedia = (() => ({ matches: true })) as never;
  mocks.scan.mockResolvedValue({
    text: "Tariffs raise import prices.",
    uncertain: 0,
    notes: "",
  });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", mocks.fetch);
  const written = {
    ...attempt,
    choice_index: null,
    question: { ...attempt.question, type: "short" as const },
  };
  show([written, { ...written, id: "b", question_id: "qb", position: 2 }], {
    mode: "short",
    feedback: "end",
    topics: [],
  });
  await act(async () => {
    fireEvent.change(
      document.querySelector('input[type="file"][capture]:not([multiple])')!,
      { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } },
    );
  });
  expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "Tariffs raise import prices.",
  );
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Question booklet" }),
    ).getByRole("button", { name: /^Question 2:/ }),
  );
  await waitFor(() =>
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/attempts/a/mark",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ answer_text: "Tariffs raise import prices." }),
      }),
    ),
  );
});

it("offers scanning only for editable typed written answers", () => {
  show();
  expect(
    screen.queryByRole("button", { name: "Scan written answer" }),
  ).toBeNull();
  cleanup();
  show(
    [
      {
        ...attempt,
        choice_index: null,
        image_paths: ["u/a-1-0.jpg"],
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  expect(
    screen.queryByRole("button", { name: "Scan written answer" }),
  ).toBeNull();
});

it("switches between typing and photo without losing the typed draft", () => {
  show([written()]);
  expect(screen.getByLabelText("Your answer")).toHaveValue("Demand grows.");
  expect(screen.queryByLabelText("Take photo / Upload")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
  expect(screen.getByLabelText("Take photo / Upload")).toBeVisible();
  expect(screen.queryByLabelText("Your answer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  expect(screen.getByLabelText("Your answer")).toHaveValue("Demand grows.");
});

it("keeps long-sprint progress targets usable and preserves answered and flagged states", async () => {
  show(
    Array.from({ length: 55 }, (_, i) => ({
      ...attempt,
      id: `a${i}`,
      question_id: `q${i}`,
      position: i + 1,
      flagged: i === 54,
    })),
  );
  const nav = screen.getByRole("navigation", { name: "Question progress" });
  const buttons = within(nav).getAllByRole("button");
  expect(buttons).toHaveLength(55);
  expect(buttons[54]).toHaveAccessibleName("Question 55, flagged, answered");
  expect(buttons[54]).toHaveClass("h-8", "min-w-8");
  expect(buttons[54].firstElementChild).toHaveClass(
    "bg-brand",
    "after:bg-[var(--pill-flag)]",
  );
  const booklet = screen.getByRole("navigation", { name: "Question booklet" });
  const bookletPill = within(booklet).getByRole("button", {
    name: "Question 55: Answered, Flagged",
  });
  expect(bookletPill).toHaveClass("bg-brand", "after:bg-[var(--pill-flag)]");
  expect(buttons[54]).toHaveClass("focus-visible:outline-2");
  expect(bookletPill).toHaveClass("focus-visible:outline-2");
  expect(screen.getByText("Current").firstElementChild).toHaveClass(
    "bg-heat-2",
  );
  expect(
    screen.getByText("Flagged", { selector: "li" }).firstElementChild,
  ).toHaveClass("bg-foreground/25", "after:bg-[var(--pill-flag)]");
  expect(
    screen
      .getByRole("button", { name: "Flag for review" })
      .closest(".sprint-session-footer"),
  ).toHaveClass("left-[var(--sprint-rail)]");
  fireEvent.click(buttons[54]);
  await waitFor(() =>
    expect(buttons[54]).toHaveAttribute("aria-current", "step"),
  );
  expect(buttons[54]).toHaveAccessibleName("Question 55, flagged, answered");
  expect(bookletPill).toHaveClass(
    "bg-brand",
    "scale-110",
    "after:bg-[var(--pill-flag)]",
  );
});

it.each(
  [false, true].flatMap((active) =>
    [false, true].flatMap((answered) =>
      [false, true].map((flagged) => ({ active, answered, flagged })),
    ),
  ),
)("maps question pill states: %o", ({ active, answered, flagged }) => {
  const pill = questionPillState({ active, answered, flagged });
  expect(pill.className.split(" ")).toContain(
    answered ? "bg-brand" : active ? "bg-heat-2" : "bg-foreground/25",
  );
  expect(pill.className.includes("text-brand-foreground")).toBe(answered);
  expect(pill.className.includes("scale-110")).toBe(active);
  expect(pill.className.includes("after:bg-[var(--pill-flag)]")).toBe(flagged);
  expect(pill.className).not.toMatch(/ring-/);
  expect(pill["aria-current"]).toBe(active ? "step" : undefined);
  expect(pill.label).toBe(
    `${answered ? "Answered" : "Not answered"}${flagged ? ", Flagged" : ""}`,
  );
});

it("View booklet blocks F and option keys, then jumps to the clicked question", async () => {
  const second = {
    ...attempt,
    id: "b",
    question_id: "q2",
    choice_index: null,
    question: { ...attempt.question, id: "q2", stem: "What is deflation?" },
  } satisfies Attempt;
  show([attempt, second], { ...session.config, feedback: "end" });
  fireEvent.click(screen.getByRole("button", { name: "View booklet" }));
  const dialog = await screen.findByRole("dialog", { name: "Booklet" });
  for (const key of ["f", "a", "1"]) fireEvent.keyDown(dialog, { key });
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Question 1: Answered" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Question 1: Answered" }),
    ).toHaveAttribute("aria-current", "step"),
  );
});

it("a reload after a confirmed leave saves the restored draft, then finishes", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ saved: true }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  localStorage.setItem(
    "claro-draft-a",
    JSON.stringify({ answer_text: "Saved on return" }),
  );
  sessionStorage.setItem("claro-left-s", "1");
  show(
    [
      {
        ...attempt,
        choice_index: null,
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  await waitFor(finishCall);
  expect(sessionStorage.getItem("claro-left-s")).toBeNull();
  expect(mocks.fetch.mock.calls[0]).toEqual([
    "/api/attempts/a/mark",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ answer_text: "Saved on return" }),
    }),
  ]);
});

it("never finishes on unload while a newer answer is still saving behind an older save", async () => {
  const held: ((value: unknown) => void)[] = [];
  mocks.fetch.mockImplementation(
    () =>
      new Promise((resolve) =>
        held.push(() =>
          resolve({ ok: true, status: 200, json: async () => ({}) }),
        ),
      ),
  );
  vi.stubGlobal("fetch", mocks.fetch);
  const beacon = vi.fn();
  Object.defineProperty(navigator, "sendBeacon", {
    value: beacon,
    configurable: true,
  });
  show(
    [
      {
        ...attempt,
        choice_index: null,
        question: { ...attempt.question, type: "short" },
      },
    ],
    { mode: "short", feedback: "end", topics: [] },
  );
  const box = screen.getByRole("textbox", { name: "Your answer" });
  fireEvent.change(box, { target: { value: "First answer" } });
  await waitFor(() => expect(held).toHaveLength(1), { timeout: 3000 });
  fireEvent.change(box, { target: { value: "Second answer" } });
  // The second save leaves the dirty map and queues behind the first.
  await new Promise((resolve) => setTimeout(resolve, 900));
  held[0](undefined);
  await waitFor(() => expect(held).toHaveLength(2), { timeout: 3000 });
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(beacon).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("claro-left-s")).toBe("1");
  expect(JSON.parse(localStorage.getItem("claro-draft-a")!)).toEqual({
    answer_text: "Second answer",
  });
  sessionStorage.clear();
});

it("keeps unselected options on cards and moves the orange selection with A–D", () => {
  show([
    {
      ...attempt,
      choice_index: null,
      question: {
        ...attempt.question,
        options: ["One", "Two", "Three", "Four"],
      },
    },
  ]);
  const options = screen.getAllByRole("radio");
  for (const [index, key] of ["a", "b", "c", "d"].entries()) {
    fireEvent.keyDown(window, { key });
    options.forEach((option, i) => {
      expect(option).toHaveProperty("checked", i === index);
      expect(option.closest("label")).toHaveClass(
        ...(i === index ? ["bg-brand-soft", "border-brand"] : ["bg-card"]),
      );
      expect(option.closest("label")).not.toHaveClass(
        i === index ? "hover:bg-muted" : "bg-brand-soft",
      );
    });
  }
});
