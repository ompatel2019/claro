import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  bulk: vi.fn(),
  save: vi.fn(),
  undo: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  usePathname: () => "/admin/content/flashcards",
  useSearchParams: () => new URLSearchParams("status=draft"),
}));
vi.mock("@/app/admin/content/flashcards/actions", () => ({
  bulkFlashcards: mocks.bulk,
  saveCard: mocks.save,
  undoFlashcards: mocks.undo,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toast, error: mocks.toast },
}));
import { AddCard, FlashcardsTable, subtopicOptions } from "./flashcards-table";
const topics = [
  { id: "parent", parent_id: null, name: "Economics", sort: 1 },
  { id: "child", parent_id: "parent", name: "Inflation", sort: 2 },
];
const two = [
  { id: "t1", parent_id: null, name: "Global", sort: 1 },
  { id: "t2", parent_id: null, name: "Australia", sort: 2 },
  { id: "t2-b", parent_id: "t2", name: "Second", sort: 2 },
  { id: "t1-a", parent_id: "t1", name: "First", sort: 1 },
  { id: "t2-a", parent_id: "t2", name: "First", sort: 1 },
  { id: "t1-b", parent_id: "t1", name: "Second", sort: 2 },
];
const pick = async (name: string, option: string) => {
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("combobox", { name }),
  );
  const o = await screen.findByRole("option", { name: option });
  fireEvent.mouseMove(o);
  fireEvent.mouseUp(o);
  fireEvent.click(o);
};
function table() {
  render(
    <FlashcardsTable
      topics={topics}
      status="draft"
      rows={[
        {
          id: "card",
          front: "GDP",
          back: "Output",
          kind: "term",
          topic_id: "child",
          status: "draft",
          origin: "claro",
          updated_at: "2026-10-09T00:00:00Z",
          reviews: 0,
          knew_first: null,
          avg: null,
        },
      ]}
      pager={{
        page: 1,
        pages: 1,
        total: 1,
        sort: { id: "updated", dir: "desc" },
      }}
    />,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.bulk.mockResolvedValue({
    ok: true,
    done: 1,
    previous: [{ id: "card", status: "draft", topic_id: "child" }],
    version: "2026-10-09T00:00:00Z",
  });
});
afterEach(cleanup);
it("requires confirmation before retiring selected cards and offers Undo", async () => {
  table();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all rows on this page" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  let dialog = await screen.findByRole("alertdialog");
  expect(mocks.bulk).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(mocks.bulk).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Retire" }));
  await waitFor(() =>
    expect(mocks.bulk).toHaveBeenCalledExactlyOnceWith(["card"], {
      kind: "retire",
    }),
  );
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      "1 retired",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    ),
  );
});
it("provides an edit button and stable names for selects and counted fields", async () => {
  table();
  const edit = screen.getByRole("button", { name: "Edit GDP" });
  edit.focus();
  expect(edit).toHaveFocus();
  fireEvent.click(edit);
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("combobox", { name: "Kind" }),
  ).toHaveTextContent("Term");
  expect(
    within(dialog).getByRole("combobox", { name: "Topic" }),
  ).toHaveTextContent("Economics · Inflation");
  expect(within(dialog).getByRole("textbox", { name: "Front" })).toHaveValue(
    "GDP",
  );
  fireEvent.click(within(dialog).getByRole("combobox", { name: "Status" }));
  {
    const option = await screen.findByRole("option", { name: "Retired" });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await screen.findByRole("alertdialog");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("lists subtopics grouped by topic even though subtopic sort restarts per topic", () => {
  expect(subtopicOptions(two).map((o) => o.label)).toEqual([
    "Global · First",
    "Global · Second",
    "Australia · First",
    "Australia · Second",
  ]);
  expect(subtopicOptions(topics)).toEqual([
    { value: "child", label: "Economics · Inflation" },
  ]);
});
it("Add card saves the chosen subtopic", async () => {
  mocks.save.mockResolvedValue({ ok: true, previous: [], version: "v" });
  render(<AddCard topics={two} />);
  fireEvent.click(screen.getByRole("button", { name: "Add card" }));
  const dialog = await screen.findByRole("dialog");
  await pick("Topic", "Australia · Second");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Front" }), {
    target: { value: "CPI" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Back" }), {
    target: { value: "Price index" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ topic_id: "t2-b", front: "CPI" }),
    ),
  );
});
it("Edit saves a changed subtopic and Move sends the chosen subtopic", async () => {
  mocks.save.mockResolvedValue({ ok: true, previous: [], version: "v" });
  table();
  fireEvent.click(screen.getByRole("button", { name: "Edit GDP" }));
  await screen.findByRole("dialog");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
  );
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "card", topic_id: "child" }),
    ),
  );
  cleanup();
  render(
    <FlashcardsTable
      topics={two}
      status="draft"
      rows={[
        {
          id: "card",
          front: "GDP",
          back: "Output",
          kind: "term",
          topic_id: "t1-a",
          status: "draft",
          origin: "claro",
          updated_at: "2026-10-09T00:00:00Z",
          reviews: 0,
          knew_first: null,
          avg: null,
        },
      ]}
      pager={{
        page: 1,
        pages: 1,
        total: 1,
        sort: { id: "updated", dir: "desc" },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit GDP" }));
  await screen.findByRole("dialog");
  await pick("Topic", "Australia · First");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
  );
  await waitFor(() =>
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "card", topic_id: "t2-a" }),
    ),
  );
  cleanup();
  table();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all rows on this page" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Move to topic" }));
  await screen.findByRole("dialog");
  const move = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Move",
  });
  expect(move).toBeDisabled();
  await pick("Subtopic", "Economics · Inflation");
  fireEvent.click(move);
  await waitFor(() =>
    expect(mocks.bulk).toHaveBeenCalledWith(["card"], {
      kind: "topic",
      topic_id: "child",
    }),
  );
});
