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
  expect(within(feedback).getByText("2 / 4")).toBeVisible();
  expect(
    within(feedback).getByText("What gets you the next mark"),
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
  expect(within(feedback).getByText("Model answer")).toBeVisible();
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
  ).toHaveTextContent("Model answer");
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
  ).toHaveTextContent("4 / 4");
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
    screen.getByRole("button", { name: /^Question 1:/ }),
  ).not.toHaveAccessibleName(/marks/);
  fireEvent.click(screen.getByRole("button", { name: /^Question 2:/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /^Question 1:/ }));
  expect(
    await screen.findByRole("textbox", { name: "Your answer" }),
  ).toHaveValue("Edited final answer");
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
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/student"));
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
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/student"));
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
