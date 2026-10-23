import { expect, it, vi } from "vitest";
import { askClaro } from "./ask-claro";

it("preserves the event helper still imported by the home ask-card", () => {
  const listener = vi.fn();
  window.addEventListener("claro:ask", listener);
  try {
    askClaro("Explain the J-curve");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toEqual({
      text: "Explain the J-curve",
    });
  } finally {
    window.removeEventListener("claro:ask", listener);
  }
});
