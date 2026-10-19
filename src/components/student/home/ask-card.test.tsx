import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const ask = vi.hoisted(() => vi.fn());
vi.mock("@/components/claro/ask-claro", () => ({ askClaro: ask }));
import { HomeAsk } from "./ask-card";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("sends suggestions and typed questions through the shared Ask Claro entrypoint", () => {
  render(<HomeAsk />);
  fireEvent.click(screen.getByRole("button", { name: /Explain the J-curve/ }));
  expect(ask).toHaveBeenCalledWith(
    "Explain the J-curve effect in two sentences",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Ask anything" }), {
    target: { value: "  Explain inflation  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send to Claro" }));
  expect(ask).toHaveBeenLastCalledWith("Explain inflation");
  expect(screen.getByRole("textbox")).toHaveValue("");
});
it("sends the exam weekday prompt to the shared sheet when the exam is near", () => {
  render(<HomeAsk today="2026-10-20" />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "What should I study before Tuesday's exam?",
    }),
  );
  expect(ask).toHaveBeenCalledWith(
    "What should I study before Tuesday's exam?",
  );
});
