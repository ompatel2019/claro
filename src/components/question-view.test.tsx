import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { QuestionKey, QuestionView } from "./question-view";

afterEach(cleanup);

it("preserves student question rendering, including literal image markdown", () => {
  const { container } = render(
    <QuestionView
      question={{
        marks: 1,
        source: "HSC Q1",
        stem: "Explain inflation.",
        stimulus: "![Chart](https://example.com/chart.png)",
      }}
    />,
  );
  expect(screen.getByText("1 mark · HSC Q1")).toHaveClass("text-xs");
  expect(screen.getByText("Explain inflation.").parentElement).toHaveClass(
    "font-semibold",
    "leading-snug",
  );
  expect(
    screen.getByText("![Chart](https://example.com/chart.png)"),
  ).toBeVisible();
  expect(screen.queryByRole("img")).toBeNull();
  expect(container.firstChild).toHaveClass("space-y-3");
});

it("supports the admin preview's images, MC options and correct-answer badge", () => {
  render(
    <QuestionView
      marks={2}
      source="HSC Q2"
      stem="Choose the answer."
      stimulus="![Chart](https://example.com/chart.png)"
      options={["First", "Second", "Third", "Fourth"]}
      correct={1}
    />,
  );
  expect(screen.getByText("HSC Q2 · 2 marks")).toBeVisible();
  expect(screen.getByRole("img", { name: "Chart" })).toHaveAttribute(
    "src",
    "https://example.com/chart.png",
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByText("Correct").closest("li")).toHaveTextContent("Second");
});

it("keeps empty admin preview placeholders and post-finish marking guidance", () => {
  render(
    <>
      <QuestionView stem="" marks={1} source="" />
      <QuestionKey
        criteria={[{ min: 1, max: 2, descriptor: "Explains the cause" }]}
        sample="A strong answer."
        explanation="Why the key is correct."
      />
    </>,
  );
  expect(screen.getByText("No source · 1 mark")).toBeVisible();
  expect(screen.getByText("The question stem appears here.")).toBeVisible();
  expect(
    screen.getByRole("table", { name: "Marking guidelines" }),
  ).toBeVisible();
  expect(screen.getByRole("cell", { name: "1–2" })).toBeVisible();
  expect(
    screen.getByRole("cell", { name: "Explains the cause" }),
  ).toBeVisible();
  expect(screen.getByText("A strong answer.")).toBeVisible();
  expect(screen.getByText("Why the key is correct.")).toBeVisible();
});

it.each([true, false])(
  "joins wrapped stems in the shared preview (student=%s)",
  (student) => {
    const question = {
      stem: "Explain a market-\nbased policy used by\ngovernment.",
      marks: 3,
      source: "HSC",
      stimulus: null,
    };
    render(
      student ? (
        <QuestionView question={question} />
      ) : (
        <QuestionView {...question} />
      ),
    );
    expect(
      screen.getByText("Explain a market-based policy used by government.")
        .textContent,
    ).toBe("Explain a market-based policy used by government.");
  },
);

it("joins wrapped model answers without losing paragraph breaks", () => {
  render(
    <QuestionKey
      sample={
        "A market-based policy\nchanges incentives.\n\nIt can reduce\npollution."
      }
    />,
  );
  expect(screen.getByText(/A market-based policy/).textContent).toBe(
    "A market-based policy changes incentives.\n\nIt can reduce pollution.",
  );
});
