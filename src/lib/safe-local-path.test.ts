import { expect, it } from "vitest";
import { safeLocalPath } from "./safe-local-path";

it.each([
  "/",
  "/student/sprint?x=1",
  "/student/activity/123#answer",
  "/student?next=%2Fstudent%2Fmark",
  "/student?q=https://example.com",
])("preserves local return path %s", (path) =>
  expect(safeLocalPath(path)).toBe(path),
);

it.each([
  undefined,
  null,
  "",
  "student",
  "https://evil.com",
  "//evil.com",
  "/\\evil.com",
  "/student\\evil.com",
  "/\tevil.com",
  "/\nevil.com",
  "/\revil.com",
  "/\0evil.com",
  "/\u007fevil.com",
  "/\u0085evil.com",
  "/a/..//evil.com",
])("rejects unsafe return path %j", (path) =>
  expect(safeLocalPath(path)).toBe("/"),
);
