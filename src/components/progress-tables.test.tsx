import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TopicProgressTable } from "./progress-tables";
import type { TopicProgress } from "@/lib/progress";
const navigation = vi.hoisted(() => ({ query: "range=90", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => "/student/progress",
  useRouter: () => ({ replace: navigation.replace }),
}));
beforeEach(() => {
  navigation.query = "range=90";
  navigation.replace.mockImplementation((url: string) => {
    navigation.query = url.split("?")[1] ?? "";
  });
});
afterEach(cleanup);
const rows: TopicProgress[] = [
  {
    id: "t3",
    parent_id: null,
    name: "Economic Issues",
    sort: 3,
    answered: 3,
    earned: 4,
    possible: 10,
    pct: 40,
    last_answered: "2026-10-09",
  },
  {
    id: "t3-inflation",
    parent_id: "t3",
    name: "Inflation",
    sort: 1,
    answered: 3,
    earned: 4,
    possible: 10,
    pct: 40,
    last_answered: "2026-10-09",
  },
  {
    id: "t3-unemployment",
    parent_id: "t3",
    name: "Unemployment",
    sort: 2,
    answered: 0,
    earned: 0,
    possible: 0,
    pct: null,
    last_answered: null,
  },
];
it("expands a parent, shows untouched topics and sorts children locally", () => {
  const view = render(<TopicProgressTable rows={rows} />);
  expect(screen.queryByText("Inflation")).toBeNull();
  expect(
    screen.getByText(/3 answered · 4 \/ 10 marks · Last practised/),
  ).toHaveTextContent("Fri 9 Oct");
  fireEvent.click(screen.getByRole("button", { name: "Economic Issues" }));
  expect(
    screen.getByRole("button", { name: "Economic Issues" }),
  ).toHaveAttribute("aria-expanded", "true");
  const table = screen.getByRole("table", {
    name: "Marks by topic",
  });
  expect(
    within(table).getByRole("link", { name: "Start Unemployment" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t3&sub=t3-unemployment");
  expect(
    within(table).getByRole("link", { name: "Practise Inflation" }),
  ).toHaveAttribute("href", "/student/sprint?topics=t3&sub=t3-inflation");
  expect(
    within(table).getAllByText(
      /3 answered · 4 \/ 10 marks · Last practised/,
    )[1],
  ).toHaveTextContent("Fri 9 Oct");
  expect(
    within(table).getByText(/0 answered · 0 \/ 0 marks · Last practised/),
  ).toHaveTextContent("Not started");
  fireEvent.click(within(table).getByRole("button", { name: "Topic" }));
  view.rerender(<TopicProgressTable rows={rows} />);
  fireEvent.click(within(table).getByRole("button", { name: "Topic" }));
  view.rerender(<TopicProgressTable rows={rows} />);
  expect(navigation.query).toBe("range=90&topicsSort=name%3Adesc");
  expect(within(table).getAllByRole("row")[2]).toHaveTextContent(
    "Unemployment",
  );
  fireEvent.click(screen.getByRole("button", { name: "Economic Issues" }));
  expect(screen.queryByText("Unemployment")).toBeNull();
});
