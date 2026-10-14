import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));
import { QuestionMark } from "./question-mark";
const fetcher = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("labels the review entry and explains caps, requiring a written reason", () => {
  render(<QuestionMark attemptId="synthetic" />);
  expect(screen.getByText(/Request a marking review/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Question this mark" }));
  expect(screen.getByText(/up to 5 per Sydney week/)).toBeVisible();
  const submit = screen.getByRole("button", { name: "Submit" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "          " },
  });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Please check my evidence." },
  });
  expect(submit).toBeEnabled();
});
it("shows a guardrail failure and allows retry", async () => {
  fetcher
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Weekly limit reached" }),
    })
    .mockResolvedValueOnce({ ok: true });
  render(<QuestionMark attemptId="synthetic" />);
  fireEvent.click(screen.getByRole("button", { name: "Question this mark" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Please check my evidence." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Weekly limit reached",
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});

it("posts the specific reason to the selected attempt", async () => {
  fetcher.mockResolvedValue({ ok: true });
  render(<QuestionMark attemptId="a1" />);
  fireEvent.click(screen.getByRole("button", { name: "Question this mark" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "I named the CPI figure." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/attempts/a1/dispute",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ note: "I named the CPI figure." }),
    }),
  );
});
