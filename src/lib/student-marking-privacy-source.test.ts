// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

it.each(["activity/[id]", "mark", "profile"])(
  "student %s queries never select raw review rows or pass marks",
  (page) => {
    const source = read(
      resolve(process.cwd(), `src/app/(app)/student/${page}/page.tsx`),
    );
    expect(source).not.toMatch(
      /\b(?:ai_mark|check_mark)\b|["']mark_reviews["']|\bmark_reviews\(/,
    );
    if (page !== "mark")
      expect(source).toContain('.from("student_mark_reviews")');
  },
);
