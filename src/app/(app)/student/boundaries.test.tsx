import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import StudentError from "./error";
import ProgressError from "./progress/error";
import MarkError from "./mark/error";
import ActivityError from "./activity/[id]/error";
import MarkNotFound from "./mark/not-found";
import ActivityNotFound from "./activity/[id]/not-found";
import MyCardsError from "./flashcards/mine/error";

afterEach(cleanup);

it.each([
  ["student/progress", [StudentError, ProgressError]],
  ["mark/activity", [MarkError, ActivityError]],
  ["flashcards/mine", [MyCardsError]],
] as const)("preserves %s error markup and retry", (_, boundaries) => {
  let expectedMarkup: string | undefined;
  for (const Boundary of boundaries) {
    const retry = vi.fn();
    const { container } = render(<Boundary unstable_retry={retry} />);
    if (expectedMarkup === undefined) {
      expectedMarkup = container.innerHTML;
      expect(expectedMarkup).toMatchSnapshot();
    }
    expect(container.innerHTML).toBe(expectedMarkup);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load this. Try again.",
    );
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    cleanup();
  }
});

it("preserves mark/activity not-found markup and home navigation", () => {
  let expectedMarkup: string | undefined;
  for (const Boundary of [MarkNotFound, ActivityNotFound]) {
    const { container } = render(<Boundary />);
    if (expectedMarkup === undefined) {
      expectedMarkup = container.innerHTML;
      expect(expectedMarkup).toMatchSnapshot();
    }
    expect(container.innerHTML).toBe(expectedMarkup);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Check not found",
    );
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/student",
    );
    cleanup();
  }
});
