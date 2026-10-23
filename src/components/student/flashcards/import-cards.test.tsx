import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  load: vi.fn(async (): Promise<{ fronts?: string[]; error?: string }> => ({
    fronts: ["Existing"],
  })),
  save: vi.fn(async (): Promise<{ ids?: string[]; error?: string }> => ({
    ids: ["new"],
  })),
  remove: vi.fn(async () => ({ ids: ["new"] })),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/(app)/flashcards/my-card-actions", () => ({
  importMyCards: mocks.save,
  loadMyCardFronts: mocks.load,
  deleteMyCards: mocks.remove,
  saveMyCard: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
import { ImportCards } from "./import-cards";
import { CARD_IMPORT_BYTE_LIMIT } from "@/lib/limits";
const topics = [
  { id: "inflation", name: "Inflation", parent_id: "t3", sort: 1 },
];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function open(source = "Anki") {
  render(<ImportCards topics={topics} />);
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  fireEvent.click(screen.getByRole("radio", { name: source }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled(),
  );
}
function paste(text: string) {
  fireEvent.change(screen.getByLabelText("Paste text"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
}
async function subtopic() {
  fireEvent.click(screen.getByRole("combobox", { name: "Subtopic" }));
  fireEvent.click(await screen.findByRole("option", { name: "Inflation" }));
}
it("guides Anki export, previews cleaned text and skips invalid and duplicate lines before importing", async () => {
  await open();
  expect(
    screen.getByText(/Set Export format to Notes in Plain Text/),
  ).toBeInTheDocument();
  paste(
    "#separator:tab\n#html:true\n<b>Fresh</b>\t&lt;b&gt;Answer&lt;/b&gt;<br>More\nbad\nEXISTING!\tanswer\nFresh\trepeated",
  );
  expect(
    screen.getByText("1 card ready · 3 lines skipped"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Line 4: No tab between front and back"),
  ).toBeInTheDocument();
  expect(screen.getByText("Line 5: Already in your cards")).toBeInTheDocument();
  expect(
    screen.getByText("Line 6: Repeated in this paste"),
  ).toBeInTheDocument();
  expect(screen.getByText("Fresh")).toBeInTheDocument();
  expect(screen.getByText("<b>Answer</b> More")).toBeInTheDocument();
  expect(screen.getByRole("table").querySelector("b")).toBeNull();
  expect(screen.getByRole("button", { name: "Import 1 card" })).toBeDisabled();
  await subtopic();
  fireEvent.click(screen.getByRole("button", { name: "Import 1 card" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith([
      {
        front: "Fresh",
        back: "<b>Answer</b>\nMore",
        topic_id: "inflation",
        kind: "term",
      },
    ]),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  const action = mocks.success.mock.calls[0][1].action;
  await action.onClick();
  expect(mocks.remove).toHaveBeenCalledWith(["new"]);
});
it("keeps server errors in the dialog", async () => {
  mocks.save.mockResolvedValueOnce({
    error: "Couldn't save your cards. Try again.",
  });
  await open("Quizlet");
  expect(screen.getByText(/Keep Tab between term/)).toBeInTheDocument();
  paste("Front\tBack");
  await subtopic();
  fireEvent.click(screen.getByRole("button", { name: "Import 1 card" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't save your cards. Try again.",
  );
});
it("rejects oversized files before reading and resets on close", async () => {
  await open();
  const read = vi.fn();
  fireEvent.change(screen.getByLabelText("Upload a .txt or .tsv file"), {
    target: { files: [{ size: CARD_IMPORT_BYTE_LIMIT + 1, text: read }] },
  });
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Files must be 1 MB or smaller.",
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  expect(screen.queryByLabelText("Paste text")).not.toBeInTheDocument();
});
it("reports failure to load existing fronts", async () => {
  mocks.load.mockResolvedValueOnce({
    error: "Couldn't load your cards. Try again.",
  });
  await open();
  expect(mocks.error).toHaveBeenCalledWith(
    "Couldn't load your cards. Try again.",
  );
});
