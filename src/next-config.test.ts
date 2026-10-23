import { expect, it, vi } from "vitest";

vi.mock("./lib/ai/docs/commit-dates.mjs", () => ({
  docCommitDates: () => "{}",
}));

import config from "../next.config";

it("permanently redirects old sprint results links to Activity", async () => {
  const redirects = await config.redirects!();
  expect(redirects).toContainEqual({
    source: "/student/sprint/:id/results",
    destination: "/student/activity/:id",
    permanent: true,
  });
  expect(redirects).toContainEqual(
    expect.objectContaining({
      source: "/practice/:id/results",
      destination: "/student/activity/:id",
    }),
  );
});
