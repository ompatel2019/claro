import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("./actions", () => actions);
import { AuthForm } from "./auth-form";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("submits sign-in credentials and the return route, then announces an error", async () => {
  actions.signIn.mockResolvedValue({ error: "Invalid email or password." });
  render(<AuthForm mode="sign-in" next="/student/profile" />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "student@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password123" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
  expect(await screen.findByText("Invalid email or password.")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  const data = actions.signIn.mock.calls[0][1] as FormData;
  expect(Object.fromEntries(data)).toEqual({
    email: "student@example.com",
    password: "password123",
    next: "/student/profile",
  });
  // React resets uncontrolled fields after the action resolves, as in the existing form.
  expect(screen.getByLabelText("Email")).toHaveValue("");
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(actions.signUp).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "Create an account" }),
  ).toHaveAttribute("href", "/sign-up");
});

it("submits account details to sign-up and announces the confirmation message", async () => {
  actions.signUp.mockResolvedValue({
    message: "Check your email to confirm your account.",
  });
  render(<AuthForm mode="sign-up" />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Student Name" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "student@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password123" },
  });
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
  fireEvent.submit(
    screen.getByRole("button", { name: "Create account" }).closest("form")!,
  );
  expect(
    await screen.findByText("Check your email to confirm your account."),
  ).toHaveAttribute("aria-live", "polite");
  expect(
    Object.fromEntries(actions.signUp.mock.calls[0][1] as FormData),
  ).toEqual({
    full_name: "Student Name",
    email: "student@example.com",
    password: "password123",
  });
  expect(actions.signIn).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
});

it("disables submission while the action is pending", async () => {
  let finish!: (state: object) => void;
  actions.signIn.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AuthForm mode="sign-in" />);
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
  expect(
    await screen.findByRole("button", { name: "Please wait…" }),
  ).toBeDisabled();
  finish({ error: "Please try again." });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled(),
  );
});
