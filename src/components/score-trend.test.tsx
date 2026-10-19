import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WeeklyAverageTrend } from "./score-trend";
import { PRACTICE_TARGET } from "@/lib/progress";

afterEach(cleanup);
it("shows the shared target, real weekly endpoint, dates and progress chart height", () => {
  const { container } = render(
    <WeeklyAverageTrend
      height={264}
      points={[
        { day: "2026-09-28", pct: 40 },
        { day: "2026-10-05", pct: 56.6 },
      ]}
    />,
  );
  expect(
    screen.getByRole("img", {
      name: `Weekly practice average with ${PRACTICE_TARGET}% target`,
    }),
  ).toHaveStyle({ height: "264px" });
  expect(screen.getByText(`${PRACTICE_TARGET}%`)).toBeInTheDocument();
  expect(screen.getByText("57%")).toBeInTheDocument();
  expect(screen.getByText("28 Sept")).toBeInTheDocument();
  expect(screen.getByText("Now")).toBeInTheDocument();
  expect(
    container.querySelector('[stroke-dasharray="4 4"]'),
  ).toBeInTheDocument();
});
