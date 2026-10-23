import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Session resume was removed (it#3). These guards keep the old entry points from coming back.
const source = (path: string) => readFileSync(path, "utf8");
const studentFiles = execSync(
  "find src/components src/app/'(app)' src/app/'(focus)' src/lib -name '*.ts*' -not -name '*.test.*'",
)
  .toString()
  .split("\n")
  .filter(Boolean);

it.each([
  ["the sprint setup resume banner", /You have an unfinished/],
  ["the Activity Resume button", /ac-resume|>\s*Resume\s*</],
  ["the Home Continue card", /\?\s*"Continue"/],
  ["the flashcard resume queue", /resumeQueue/],
  ["welcome back toasts", /Welcome back/],
  ["Mark my answer drafts", /claro\.single\.|Draft saved in this browser/],
  ["flashcard answer drafts", /claro\.flashcard\.draft/],
])("keeps %s removed", (_name, pattern) => {
  expect(studentFiles.filter((f) => pattern.test(source(f)))).toEqual([]);
});

it("keeps the banner's Finish component and the Draft pill out of student Activity", () => {
  expect(existsSync("src/components/finish-sprint.tsx")).toBe(false);
  const list = source("src/components/student/activity/session-list.tsx");
  expect(list).not.toMatch(/"Draft"|Resume|unfinished/);
  expect(source("src/components/activity-browser.tsx")).not.toMatch(
    /In progress/,
  );
});

it("keeps open sessions out of Home and Activity queries", () => {
  expect(source("src/components/student/home/sections.tsx")).toMatch(
    /\.not\("finished_at", "is", null\)/,
  );
  expect(source("src/app/(app)/student/activity/page.tsx")).toMatch(
    /\.not\("finished_at", "is", null\)/,
  );
  expect(source("supabase/migrations/0084_session_last_active.sql")).toMatch(
    /and s\.finished_at is not null/,
  );
});
