import {
  cleanup,
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { createClient } from "@/utils/supabase/client";
import { WrittenAnswer } from "./written-answer";
import { type Attempt } from "@/lib/practice";
vi.mock("@/lib/auth-client", () => ({
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
  ensureSession: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
const attempt = {
  id: "a",
  status: "pending",
  question: { type: "short", marks: 4 },
  answer_text: "Draft answer",
  transcript: null,
  image_paths: null,
} as Attempt;
function answer(disabled = false) {
  return render(
    <WrittenAnswer
      disabled={disabled}
      attempt={attempt}
      userId="u"
      onBusy={vi.fn()}
      edit={vi.fn()}
      save={vi.fn()}
      flush={vi.fn()}
      local={vi.fn()}
    />,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});
it("polls the server status route and applies its student feedback", async () => {
  const marked = {
    status: "marked",
    mark: 3,
    max_marks: 4,
    band: "Sound",
    feedback: { comments: [] },
  };
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => marked,
  });
  vi.stubGlobal("fetch", fetchMock);
  const local = vi.fn();
  render(
    <WrittenAnswer
      attempt={{ ...attempt, status: "marking" }}
      disabled={false}
      userId="u"
      onBusy={vi.fn()}
      edit={vi.fn()}
      save={vi.fn()}
      flush={vi.fn()}
      local={local}
    />,
  );
  await waitFor(() => expect(local).toHaveBeenCalledWith(marked));
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/attempts/a/status", {
    cache: "no-store",
  });
});
it("locks typing and photo upload together while disabled", () => {
  answer(true);
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByLabelText("Take photo / Upload")).toBeDisabled();
});
it("embeds single-check input without offering a second submit action", () => {
  answer();
  expect(screen.getByRole("textbox")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
});
it("rejects more than eight single-check pages before any upload or transcription", async () => {
  answer();
  const files = Array.from(
    { length: 9 },
    (_, i) => new File(["photo"], `${i}.png`, { type: "image/png" }),
  );
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: { files },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Use photo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Upload up to 8 pages per question.",
  );
});

it("appends camera shots, flushes once per batch, and reads only on request", async () => {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const { createClient } = await import("@/utils/supabase/client");
  vi.mocked(createClient).mockReturnValue({
    storage: { from: () => ({ upload }) },
  } as never);
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      transcript: "Two pages",
      lines: ["Two pages"],
      notes: "",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const flush = vi.fn().mockResolvedValue(undefined);
  const save = vi.fn().mockResolvedValue(undefined);
  const { useState } = await import("react");
  function Photos() {
    const [row, setRow] = useState({
      ...attempt,
      answer_text: null,
      image_paths: ["u/existing.png"],
    });
    return (
      <WrittenAnswer
        attempt={row}
        disabled={false}
        userId="u"
        onBusy={vi.fn()}
        edit={vi.fn()}
        save={save}
        flush={flush}
        local={(patch) => setRow((r) => ({ ...r, ...patch }) as typeof row)}
      />
    );
  }
  render(<Photos />);
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: {
      files: [
        new File(["photo"], "shot1.png", { type: "image/png" }),
        new File(["photo"], "shot2.png", { type: "image/png" }),
      ],
    },
  });
  expect(await screen.findByText("Page 3")).toBeVisible();
  expect(flush).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0][0]).not.toBe(upload.mock.calls[1][0]);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      image_paths: [
        "u/existing.png",
        upload.mock.calls[0][0],
        upload.mock.calls[1][0],
      ],
    }),
  );
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Read my handwriting" }));
  expect(
    await screen.findByRole("button", { name: "Confirm transcript" }),
  ).toBeVisible();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "/api/attempts/a/transcribe",
    { method: "POST" },
  );
});

it("removes already uploaded objects if a later page in the batch fails", async () => {
  const upload = vi
    .fn()
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: { message: "Upload interrupted" } });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const { createClient } = await import("@/utils/supabase/client");
  vi.mocked(createClient).mockReturnValue({
    storage: { from: () => ({ upload, remove }) },
  } as never);
  const save = vi.fn();
  render(
    <WrittenAnswer
      attempt={{
        ...attempt,
        id: "11111111-1111-4111-8111-111111111111",
        answer_text: null,
      }}
      disabled={false}
      userId="u"
      onBusy={vi.fn()}
      edit={vi.fn()}
      save={save}
      flush={vi.fn()}
      local={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: {
      files: [1, 2].map(
        (i) => new File(["photo"], `${i}.png`, { type: "image/png" }),
      ),
    },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Upload interrupted",
  );
  expect(remove).toHaveBeenCalledExactlyOnceWith([
    upload.mock.calls[0][0],
    upload.mock.calls[1][0],
  ]);
  expect(save).not.toHaveBeenCalled();
});

it("keeps cleanup failures invisible and retries the queue after a minute", async () => {
  vi.useFakeTimers();
  const path = "u/11111111-1111-4111-8111-111111111111-1729000000000-0.png";
  localStorage.setItem("claro-photo-cleanup-u", JSON.stringify([path]));
  const remove = vi
    .fn()
    .mockResolvedValueOnce({ error: { message: "Storage unavailable" } })
    .mockResolvedValue({ error: null });
  vi.mocked(createClient).mockReturnValue({
    storage: { from: () => ({ remove }) },
  } as unknown as ReturnType<typeof createClient>);
  const view = answer();
  await act(async () => {});
  expect(remove).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: /cleanup/i })).toBeNull();
  expect(localStorage.getItem("claro-photo-cleanup-u")).not.toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(remove).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem("claro-photo-cleanup-u")).toBeNull();
  view.unmount();
  localStorage.setItem("claro-photo-cleanup-u", JSON.stringify([path]));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(remove).toHaveBeenCalledTimes(2);
});
