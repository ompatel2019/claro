import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LatestSessions } from "./latest-sessions";
afterEach(cleanup);
it("shows only three sessions and opens each student report in their activity", () => {
  render(
    <LatestSessions
      rows={Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        user_id: "student",
        name: `Student ${i}`,
        kind: "Sprint",
        score: "75%",
        tone: "warning",
        when: "just now",
      }))}
    />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getAllByRole("link")[0]).toHaveAttribute(
    "href",
    "/admin/students/student?tab=sessions&session=s0",
  );
  expect(screen.queryByRole("table")).toBeNull();
});
it("keeps unscored sessions readable", () => {
  render(
    <LatestSessions
      rows={[
        {
          id: "s",
          user_id: "u",
          name: "Student",
          kind: "Study",
          score: "—",
          tone: null,
          when: "today",
        },
      ]}
    />,
  );
  expect(screen.getByRole("link")).toHaveTextContent(
    "StudentStudy—todayOpen Activity",
  );
});
