import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openSpotCheck: vi.fn(),
  push: vi.fn(),
  setBlocked: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/app/admin/students/actions", () => ({
  openSpotCheck: mocks.openSpotCheck,
  setBlocked: mocks.setBlocked,
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { SpotCheck, StudentMenu } from "./student-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setBlocked.mockResolvedValue(undefined);
  mocks.openSpotCheck.mockResolvedValue({ id: "review" });
});
afterEach(cleanup);

it("confirms before blocking sign-in and keeps the undo action", async () => {
  render(<StudentMenu userId="student" blocked={false} />);

  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Block sign-in" }),
  );
  expect(mocks.setBlocked).not.toHaveBeenCalled();

  const confirm = await screen.findByRole("alertdialog");
  fireEvent.click(
    within(confirm).getByRole("button", { name: "Block sign-in" }),
  );

  await waitFor(() =>
    expect(mocks.setBlocked).toHaveBeenCalledExactlyOnceWith("student", true),
  );
  expect(mocks.toastSuccess).toHaveBeenCalledWith(
    "Sign-in blocked",
    expect.objectContaining({
      action: expect.objectContaining({ label: "Undo" }),
    }),
  );
});

it("opens a spot check in the review workflow", async () => {
  render(<SpotCheck attemptId="attempt" />);
  fireEvent.click(screen.getByRole("button", { name: "Open in review" }));

  await waitFor(() =>
    expect(mocks.openSpotCheck).toHaveBeenCalledExactlyOnceWith("attempt"),
  );
  expect(mocks.push).toHaveBeenCalledWith("/admin/marking/review/review");
});
