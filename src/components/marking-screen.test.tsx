import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkingScreen } from "./marking-screen";
afterEach(cleanup);
it("announces a branded full-page pending screen without invented progress", () => {
  render(<MarkingScreen />);
  const status = screen.getByRole("status");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(screen.getByRole("img", { name: "Claro" })).toBeInTheDocument();
  expect(screen.getByRole("heading")).toHaveTextContent("Marking your answers");
  expect(status.className).toContain("fixed inset-0");
  expect(screen.queryByRole("progressbar")).toBeNull();
  const graphic = status.querySelector("svg[viewBox='0 0 200 144']");
  expect(graphic).toHaveAttribute("aria-hidden", "true");
  expect(graphic?.querySelectorAll("path[pathLength='1']")).toHaveLength(3);
});
it("uses singular copy for Mark my answer", () => {
  render(<MarkingScreen single />);
  expect(screen.getByRole("heading")).toHaveTextContent(
    /^Marking your answer$/,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "against the guidelines",
  );
});

const actions = vi.hoisted(() => ({ create: vi.fn(), finish: vi.fn() }));
vi.mock("@/app/(app)/student/mark/actions", () => ({
  createCheck: actions.create,
  finishCheck: actions.finish,
  restoreUnreadableCheck: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
it("shows the shared screen during Mark my answer submission and restores the draft on error", async () => {
  const { MarkMyAnswer } = await import("./mark-my-answer");
  let resolve!: (value: unknown) => void;
  actions.create.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(
    <MarkMyAnswer
      questions={[
        {
          id: "q",
          type: "short",
          stem: "Explain inflation.",
          marks: 4,
          source: "Synthetic",
          year: 2025,
          topic_id: "t",
          stimulus: null,
          options: null,
        },
      ]}
      topics={[]}
      userId="synthetic"
      left={20}
    />,
  );
  fireEvent.click(screen.getByRole("option", { name: /Explain inflation/ }));
  const answer = screen.getByRole("textbox", { name: "Your answer" });
  fireEvent.change(answer, {
    target: { value: "Demand rises faster than supply." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mark my answer" }));
  expect(
    await screen.findByRole("heading", {
      name: "Marking your answer",
    }),
  ).toBeVisible();
  expect(answer).toBeInTheDocument();
  expect(answer).not.toBeVisible();
  await act(async () => resolve({ error: "Submission unavailable" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Submission unavailable",
  );
  expect(
    screen.queryByRole("heading", { name: "Marking your answer" }),
  ).toBeNull();
  expect(answer).toBeVisible();
  expect(answer).toHaveValue("Demand rises faster than supply.");
  localStorage.clear();
});

it("shows a sprint's answer sheet with real marked counts and a way to leave", () => {
  render(
    <MarkingScreen
      title="Mixed sprint"
      sheet={{
        marked: 3,
        total: 5,
        rows: [
          {
            key: "mcq",
            label: "Multiple choice · Q1 to Q3",
            detail: "3 questions",
            marked: 2,
            total: 3,
          },
          {
            key: "a",
            label: "Q4",
            detail: "Written answer · 4 marks",
            marked: 1,
            total: 1,
          },
          {
            key: "b",
            label: "Q5",
            detail: "Written answer · 6 marks",
            marked: 0,
            total: 1,
          },
          {
            key: "c",
            label: "Q6",
            detail: "Written answer · 3 marks",
            marked: 0,
            total: 1,
            marking: true,
          },
        ],
      }}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items.map((li) => li.textContent)).toEqual([
    "Multiple choice · Q1 to Q32 of 3 marked3 questions",
    "Q4MarkedWritten answer · 4 marks",
    "Q5WaitingWritten answer · 6 marks",
    "Q6MarkingWritten answer · 3 marks",
  ]);
  const bar = screen.getByRole("progressbar", { name: "Answers marked" });
  expect(bar).toHaveAttribute("aria-valuenow", "3");
  expect(bar).toHaveAttribute("aria-valuemax", "5");
  expect(screen.getByText("3 of 5 marked")).toBeInTheDocument();
  expect(screen.getByText("In progress · 3 of 5")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to Activity" })).toHaveAttribute(
    "href",
    "/student/activity",
  );
  expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute(
    "href",
    "/student",
  );
  expect(screen.queryByRole("button", { name: /replay/i })).toBeNull();
  // Item 16: the sheet scrolls with the page, never an inner scrollbar.
  const status = screen.getByRole("status");
  expect(status.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  expect(status.className).not.toContain("fixed");
});

it("keeps the generic screen when a sprint has no answers", () => {
  render(<MarkingScreen sheet={{ rows: [], marked: 0, total: 0 }} />);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByRole("list")).toBeNull();
});
