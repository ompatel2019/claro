import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../auth-form", () => ({
  AuthForm: ({ next }: { next: string }) => (
    <input aria-label="Return path" value={next} readOnly />
  ),
}));
import SignInPage from "./page";

afterEach(cleanup);

it.each([
  ["/student/sprint?x=1#answer", "/student/sprint?x=1#answer"],
  ["/\\evil.com", "/"],
  ["//evil.com", "/"],
  ["/\nevil.com", "/"],
])("sanitizes the sign-in form destination %j", async (next, expected) => {
  render(await SignInPage({ searchParams: Promise.resolve({ next }) }));
  expect(screen.getByLabelText("Return path")).toHaveValue(expected);
});
