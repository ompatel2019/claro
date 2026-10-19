import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkMyAnswer } from "./mark-my-answer";
import type { BankQuestion } from "@/lib/single-check";
const createCheck = vi.hoisted(() => vi.fn());
const finishCheck = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/student/mark/actions", () => ({
  createCheck,
  finishCheck,
  restoreUnreadableCheck: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
vi.mock("@/lib/auth-client", () => ({
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
const questions = [
  {
    id: "q1",
    type: "short",
    stem: "Explain the causes of inflation.",
    marks: 4,
    source: "2023 HSC Q22",
    year: 2023,
    topic_id: "t3-inflation",
    stimulus: null,
    options: null,
    verb: "explain",
  },
] satisfies BankQuestion[];
function setup(left = 20, allowOwnQuestion = false) {
  return render(
    <MarkMyAnswer
      questions={questions}
      topics={[]}
      userId="u"
      left={left}
      allowOwnQuestion={allowOwnQuestion}
    />,
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("searches stems and source, selects the question and enables only a valid answer without creating a session", () => {
  setup();
  const submit = screen.getByRole("button", {
    name: "Mark my answer",
  });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search questions"), {
    target: { value: "2023 HSC Q22" },
  });
  fireEvent.click(screen.getByRole("option", { name: /Explain the causes/ }));
  expect(screen.getByText("Answering")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
    target: { value: "Inflation rises as aggregate demand increases." },
  });
  expect(submit).toBeEnabled();
  expect(createCheck).not.toHaveBeenCalled();
});
it("shows inline own-question validation and auto-fills the verb when enabled", () => {
  setup(20, true);
  fireEvent.click(screen.getByRole("button", { name: "My own question" }));
  const stem = screen.getByRole("textbox", { name: /Question text/ });
  fireEvent.change(stem, { target: { value: "Explain" } });
  fireEvent.blur(stem);
  expect(screen.getByRole("alert")).toHaveTextContent("at least 10 characters");
  fireEvent.change(stem, {
    target: { value: "Assess the impact of fiscal policy." },
  });
  expect(
    screen.getByRole("combobox", { name: "Directive verb" }),
  ).toHaveTextContent("Assess");
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
  expect(createCheck).not.toHaveBeenCalled();
});
it("toggles Photo without uploading or transcribing", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
  expect(screen.getByLabelText("Take photo / Upload")).toBeDisabled();
  expect(screen.getByText(/Upload up to 8 pages/)).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Your answer" })).toBeNull();
  expect(createCheck).not.toHaveBeenCalled();
});
it("shows the daily cap and keeps submit disabled", () => {
  setup(0);
  expect(screen.getByRole("alert")).toHaveTextContent("More at midnight");
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
});

it("re-detects the verb after a manual selection when the question changes", async () => {
  setup(20, true);
  fireEvent.click(screen.getByRole("button", { name: "My own question" }));
  const stem = screen.getByRole("textbox", { name: /Question text/ });
  fireEvent.change(stem, { target: { value: "Assess fiscal policy." } });
  fireEvent.click(screen.getByRole("combobox", { name: "Directive verb" }));
  const option = await screen.findByRole("option", { name: "Explain" });
  fireEvent.mouseMove(option);
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Directive verb" }),
    ).toHaveTextContent("Explain"),
  );
  fireEvent.change(stem, { target: { value: "Outline fiscal policy." } });
  expect(
    screen.getByRole("combobox", { name: "Directive verb" }),
  ).toHaveTextContent("Outline");
});
it("routes to live results while marking continues, using one saved attempt", async () => {
  const { createClient } = await import("@/utils/supabase/client");
  const update = vi.fn();
  const query = {
    update,
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn().mockResolvedValue({ data: [{ id: "a" }], error: null }),
  };
  update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: () => query } as never);
  createCheck.mockResolvedValue({ sessionId: "s", attemptId: "a" });
  finishCheck.mockResolvedValue({ error: null });
  const fetch = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  setup();
  fireEvent.click(screen.getByRole("option", { name: /Explain the causes/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
    target: { value: "Demand grows faster than supply." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mark my answer" }));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith("/student/activity/s"),
  );
  expect(createCheck).toHaveBeenCalledTimes(1);
  expect(finishCheck).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({
    answer_text: "Demand grows faster than supply.",
    transcript: null,
    image_paths: null,
  });
});

it("converts a restored photo transcript to a single typed answer", async () => {
  const { createClient } = await import("@/utils/supabase/client");
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn().mockResolvedValue({ data: [{ id: "a" }], error: null }),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: () => query } as never);
  render(
    <MarkMyAnswer
      questions={questions}
      topics={[]}
      userId="u"
      left={19}
      initial={{
        sessionId: "s",
        questionId: "q1",
        attempt: {
          id: "a",
          question_id: "q1",
          position: 1,
          choice_index: null,
          answer_text: null,
          transcript: "Demand grows faster than supply.",
          image_paths: ["u/photo.png"],
          flagged: false,
          status: "transcribed",
          mark: null,
          max_marks: null,
          band: null,
          feedback: null,
        },
      }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Confirm transcript" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Type$/ }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Demand grows faster than supply.",
    ),
  );
  expect(query.update).toHaveBeenCalledWith({
    answer_text: "Demand grows faster than supply.",
    transcript: null,
    image_paths: null,
  });
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeEnabled();
  expect(createCheck).not.toHaveBeenCalled();
});
it("does not redirect every new check to a completed cached session", async () => {
  const { createClient } = await import("@/utils/supabase/client");
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { finished_at: "2026-10-09" }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: () => query } as never);
  localStorage.setItem(
    "claro.single.u",
    JSON.stringify({
      source: "bank",
      selected: "q1",
      own: {
        stem: "",
        marks: 0,
        verb: "",
        topic_id: null,
        criteria_text: null,
      },
      mode: "type",
      answer: {
        answer_text: "Cached text",
        transcript: null,
        image_paths: null,
      },
      sessionId: "finished",
    }),
  );
  setup();
  await waitFor(() => expect(query.maybeSingle).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "",
    ),
  );
  expect(router.replace).not.toHaveBeenCalled();
});

it("selects a bank question from the search combobox using the keyboard", () => {
  setup();
  const search = screen.getByRole("combobox", { name: "Search questions" });
  fireEvent.change(search, { target: { value: "inflation" } });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(search).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: /Explain the causes/ }).id,
  );
  fireEvent.keyDown(search, { key: "Enter" });
  expect(screen.getByText("Answering")).toBeVisible();
  expect(search).toHaveAttribute("aria-expanded", "false");
  expect(createCheck).not.toHaveBeenCalled();
});

it("restores unsaved text without replacing a saved session's immutable question", async () => {
  const savedQuestion = {
    stem: "Explain the causes of inflation.",
    marks: 4,
    verb: "explain",
    topic_id: null,
    criteria_text: null,
  };
  localStorage.setItem(
    "claro.single.u",
    JSON.stringify({
      source: "own",
      selected: "",
      own: {
        ...savedQuestion,
        stem: "Assess a different question.",
        marks: 20,
      },
      mode: "type",
      sessionId: "s",
      answer: {
        answer_text: "Unsaved answer",
        transcript: null,
        image_paths: null,
      },
    }),
  );
  render(
    <MarkMyAnswer
      questions={questions}
      topics={[]}
      userId="u"
      left={19}
      initial={{
        sessionId: "s",
        question: savedQuestion,
        attempt: {
          id: "a",
          question_id: "",
          position: 1,
          choice_index: null,
          answer_text: "Saved answer",
          transcript: null,
          image_paths: null,
          flagged: false,
          status: "pending",
          mark: null,
          max_marks: null,
          band: null,
          feedback: null,
        },
      }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Unsaved answer",
    ),
  );
  expect(screen.getByRole("textbox", { name: /Question text/ })).toHaveValue(
    savedQuestion.stem,
  );
  expect(screen.getByRole("combobox", { name: /^Marks$/ })).toHaveTextContent(
    "4 marks",
  );
  expect(screen.getByText(/aim for about 140–200/)).toBeVisible();
});

it("defaults to bank-only with useful filtered-empty copy", () => {
  setup();
  expect(
    screen.getByRole("button", { name: "My own question" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search questions"), {
    target: { value: "synthetic missing question" },
  });
  expect(
    screen.getByText(
      "No questions match. Try another search or change your filters.",
    ),
  ).toBeVisible();
});
it("a stale own-question draft cannot enable the hidden feature or select a bank question", async () => {
  localStorage.setItem(
    "claro.single.u",
    JSON.stringify({
      source: "own",
      selected: "q1",
      own: {
        stem: "Explain inflation.",
        marks: 4,
        verb: "explain",
        topic_id: null,
        criteria_text: null,
      },
      mode: "type",
      sessionId: null,
      answer: {
        answer_text: "Saved synthetic answer",
        transcript: null,
        image_paths: null,
      },
    }),
  );
  setup();
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Saved synthetic answer",
    ),
  );
  expect(
    screen.queryByRole("textbox", { name: /Question text/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Selected question/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
  expect(createCheck).not.toHaveBeenCalled();
});

it("an empty bank cannot start a check or expose own-question fields", () => {
  render(<MarkMyAnswer questions={[]} topics={[]} userId="u" left={20} />);
  expect(
    screen.getByText(
      "No questions match. Try another search or change your filters.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "My own question" }),
  ).toBeDisabled();
  expect(createCheck).not.toHaveBeenCalled();
});

const restoredOwn = {
  source: "own",
  selected: "",
  sessionId: null,
  mode: "type",
  own: {
    stem: "Explain inflation.",
    marks: 0,
    verb: "explain",
    topic_id: null,
    criteria_text: null,
  },
  answer: { answer_text: null, transcript: null, image_paths: null },
};
async function restoredForm(allowAutofill = true) {
  localStorage.setItem("claro.single.u", JSON.stringify(restoredOwn));
  render(
    <MarkMyAnswer
      questions={[]}
      topics={[]}
      userId="u"
      left={20}
      allowOwnQuestion
      allowAutofill={allowAutofill}
    />,
  );
  return screen.findByRole("textbox", { name: /Question text/ });
}
const generated = {
  stem: "Assess monetary policy.",
  marks: 4,
  verb: "assess",
  topic_id: "policy",
  criteria_text:
    "1-2: Identifies relevant monetary policy tools.\n3-4: Explains policy mechanisms and economic effects.",
};
it("restores drafts without disabling verb detection and keeps the checks card in flow", async () => {
  const stem = await restoredForm(false);
  fireEvent.change(stem, { target: { value: generated.stem } });
  expect(
    screen.getByRole("combobox", { name: "Directive verb" }),
  ).toHaveTextContent("Assess");
  expect(screen.getByText(/20 of 20/).parentElement?.className).not.toMatch(
    /sticky|fixed|bottom-/,
  );
});
it("autofills once on blur, and re-runs only for changed text", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => generated });
  vi.stubGlobal("fetch", fetch);
  const stem = await restoredForm();
  fireEvent.change(stem, { target: { value: generated.stem } });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.blur(stem);
  await waitFor(() =>
    expect(screen.getByLabelText(/Marking guidelines/)).toHaveValue(
      generated.criteria_text,
    ),
  );
  fireEvent.blur(stem);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(stem, { target: { value: "Explain exchange rates." } });
  fireEvent.blur(stem);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
it("preserves guidelines edited during a pending autofill", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  const stem = await restoredForm();
  fireEvent.change(stem, { target: { value: generated.stem } });
  fireEvent.blur(stem);
  fireEvent.change(screen.getByLabelText(/Marking guidelines/), {
    target: { value: "My own guidelines" },
  });
  resolve({ ok: true, json: async () => generated });
  await waitFor(() =>
    expect(screen.queryByText("Suggesting question details…")).toBeNull(),
  );
  expect(screen.getByLabelText(/Marking guidelines/)).toHaveValue(
    "My own guidelines",
  );
});
it("ignores responses for replaced questions", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  const stem = await restoredForm();
  fireEvent.blur(stem);
  fireEvent.change(stem, { target: { value: "Outline fiscal policy." } });
  resolve({ ok: true, json: async () => generated });
  await waitFor(() =>
    expect(screen.queryByText("Suggesting question details…")).toBeNull(),
  );
  expect(screen.getByLabelText(/Marking guidelines/)).toHaveValue("");
});
it("does not request suggestions with the flag off or a short question", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const stem = await restoredForm(false);
  fireEvent.blur(stem);
  fireEvent.change(stem, { target: { value: "Explain" } });
  fireEvent.blur(stem);
  expect(fetch).not.toHaveBeenCalled();
});
it("shows a retryable autofill error", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Please retry." }),
    })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...generated, stem: restoredOwn.own.stem }),
    });
  vi.stubGlobal("fetch", fetch);
  const stem = await restoredForm();
  fireEvent.blur(stem);
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry autofill" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText(/Marking guidelines/)).toHaveValue(
      generated.criteria_text,
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("queues a changed question blurred while the previous fill is pending", async () => {
  let resolve!: (value: unknown) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...generated, stem: "Outline fiscal policy." }),
    });
  vi.stubGlobal("fetch", fetch);
  const stem = await restoredForm();
  fireEvent.blur(stem);
  fireEvent.change(stem, { target: { value: "Outline fiscal policy." } });
  fireEvent.blur(stem);
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve({ ok: true, json: async () => generated });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    stem: "Outline fiscal policy.",
  });
});

it("waits for autofill before accepting the keyboard submit shortcut", async () => {
  localStorage.setItem(
    "claro.single.u",
    JSON.stringify({
      ...restoredOwn,
      own: { ...restoredOwn.own, marks: 4 },
      answer: {
        ...restoredOwn.answer,
        answer_text: "Interest rates affect household spending.",
      },
    }),
  );
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  render(
    <MarkMyAnswer
      questions={[]}
      topics={[]}
      userId="u"
      left={20}
      allowOwnQuestion
      allowAutofill
    />,
  );
  const stem = await screen.findByRole("textbox", { name: /Question text/ });
  fireEvent.blur(stem);
  fireEvent.keyDown(stem, { key: "Enter", ctrlKey: true });
  expect(createCheck).not.toHaveBeenCalled();
  resolve({ ok: true, json: async () => generated });
  await waitFor(() =>
    expect(screen.queryByText("Suggesting question details…")).toBeNull(),
  );
});
