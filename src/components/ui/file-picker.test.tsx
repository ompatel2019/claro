import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FilePicker } from "./file-picker";

afterEach(cleanup);

it("labels a focusable native input and passes through upload options", () => {
  render(
    <FilePicker
      label="Upload photo"
      icon="camera"
      multiple
      accept="image/jpeg,image/png"
      capture="environment"
    />,
  );
  const input = screen.getByLabelText("Upload photo");
  expect(input).toHaveAccessibleName("Upload photo");
  expect(input).toHaveAttribute("type", "file");
  expect(input).toHaveAttribute("multiple");
  expect(input).toHaveAttribute("accept", "image/jpeg,image/png");
  expect(input).toHaveAttribute("capture", "environment");
  expect(input).toHaveClass("sr-only");
  expect(input.tabIndex).toBe(0);
  input.focus();
  expect(input).toHaveFocus();
  expect(input.closest("label")).toHaveClass("focus-within:ring-3");
});

it("shows file names and passes the original change event to the caller", () => {
  const files = [new File(["a"], "first.txt"), new File(["b"], "second.txt")];
  const onChange = vi.fn((event) => {
    expect(event.target.files).toEqual(files);
    event.target.value = "";
  });
  render(<FilePicker label="Upload file" multiple onChange={onChange} />);
  const input = screen.getByLabelText("Upload file");
  expect(screen.queryByText(/No file chosen/)).toBeNull();
  fireEvent.change(input, { target: { files } });
  expect(onChange).toHaveBeenCalledOnce();
  expect(screen.getByText("first.txt, second.txt")).toBeInTheDocument();
  expect(input).toHaveAccessibleName("Upload file");
});

it("disables the native input", () => {
  render(<FilePicker label="Upload file" disabled />);
  const input = screen.getByLabelText("Upload file");
  expect(input).toBeDisabled();
  input.focus();
  expect(input).not.toHaveFocus();
});
