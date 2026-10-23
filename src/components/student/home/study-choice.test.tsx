import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StudyChoice } from "./study-choice";

afterEach(cleanup);
it("offers two setup destinations and explains scheduled review before starting anything", async () => {
  render(<StudyChoice />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Light up today" }));
  const dialog = await screen.findByRole("dialog", {
    name: "What would you like to study?",
  });
  expect(dialog).toBeVisible();
  expect(screen.getByRole("link", { name: /Topic Sprint/ })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  expect(screen.getByRole("link", { name: /Flashcards/ })).toHaveAttribute(
    "href",
    "/student/flashcards",
  );
  expect(
    screen.getByText(/Due for review means your saved review date has arrived/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
