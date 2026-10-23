import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RichText } from "./rich-text";

afterEach(cleanup);

it.each([false, true])(
  "joins PDF wraps with renderImages=%s",
  (renderImages) => {
    render(
      <RichText
        text={"Explain the policy used by\ngovernment to limit pollution."}
        renderImages={renderImages}
      />,
    );
    expect(
      screen.getByText(
        "Explain the policy used by government to limit pollution.",
      ).textContent,
    ).toBe("Explain the policy used by government to limit pollution.");
  },
);

it("keeps paragraphs, lists and GFM tables", () => {
  render(
    <RichText
      text={
        "Discuss:\n(a) First policy\ncontinued.\n(b) Second policy.\n\nYear | GDP\n--- | ---\n2023 | 2%"
      }
    />,
  );
  expect(screen.getByText(/Discuss:/).textContent).toBe(
    "Discuss:\n(a) First policy continued.\n(b) Second policy.",
  );
  expect(screen.getByRole("columnheader", { name: "Year" })).toBeVisible();
  expect(screen.getByRole("cell", { name: "2%" })).toBeVisible();
});
