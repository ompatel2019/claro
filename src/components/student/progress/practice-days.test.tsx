import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PracticeDays } from "./practice-days";
afterEach(cleanup);
it("links real activity, identifies today, and omits dates outside the selected range", () => {
  render(
    <PracticeDays
      today="2026-10-23"
      from="2026-10-22"
      days={[{ day: "2026-10-23", questions: 2, cards: 3 }]}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(
    screen.getByRole("link", { name: /2 questions · 3 flashcards/ }),
  ).toHaveAttribute("aria-current", "date");
  expect(screen.getByRole("link", { name: /No activity/ })).toHaveAttribute(
    "href",
    "/student/activity?date=2026-10-22",
  );
});
it("reports unavailable days instead of drawing an empty calendar", () => {
  render(<PracticeDays today="2026-10-23" from={null} days={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("couldn’t load");
  expect(screen.queryByRole("link")).toBeNull();
});
