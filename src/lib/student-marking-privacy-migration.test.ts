// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const directory = resolve(process.cwd(), "supabase/migrations");
const filename = "0048_student_marking_privacy.sql";
const read = (path: string) => readFileSync(path, "utf8");
const normalize = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
const sql = normalize(read(resolve(directory, filename)));
const definition =
  /create (?:or replace )?function public\.session_review\([\s\S]*?\$\$;/g;
const rpc = [...sql.matchAll(definition)][0][0];

it("idempotently removes only legacy eval flags from affected attempt feedback", () => {
  expect(sql).toContain(
    "update public.attempts set feedback = feedback #- '{flags,uncertain}' #- '{flags,marks}' where feedback->'flags' ? 'uncertain' or feedback->'flags' ? 'marks';",
  );
  expect(sql).not.toMatch(/alter table|drop function|delete from/i);
});

it("replaces the latest session_review with the same contract and sanitised output", () => {
  const previous = readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && name < filename)
    .sort()
    .map((name) => normalize(read(resolve(directory, name))))
    .flatMap((content) => [...content.matchAll(definition)])
    .at(-1)![0];
  expect(rpc).toBe(
    previous
      .replace("create function", "create or replace function")
      .replace(
        "a.band, a.feedback,",
        "a.band, a.feedback #- '{flags,uncertain}' #- '{flags,marks}',",
      )
      .replace(
        "'reason', r.reason, 'ai_mark', r.ai_mark, 'check_mark', r.check_mark, 'final_mark'",
        "'reason', r.reason, 'final_mark'",
      ),
  );
  expect(rpc).not.toMatch(/ai_mark|check_mark/);
  expect(sql).toContain(
    "revoke execute on function public.session_review(uuid) from public, anon;",
  );
  expect(sql).toContain(
    "grant execute on function public.session_review(uuid) to authenticated;",
  );
});

it("makes raw review rows admin-only and exposes only owned safe review columns", () => {
  expect(sql).toContain(
    'drop policy if exists "own or admin read" on public.mark_reviews;',
  );
  expect(sql).toContain(
    'drop policy if exists "admin read" on public.mark_reviews;',
  );
  expect(sql).toContain(
    'create policy "admin read" on public.mark_reviews for select to authenticated using ((select public.is_admin()));',
  );
  expect(sql).toContain(
    "create or replace view public.student_mark_reviews with (security_barrier = true) as select r.id, r.attempt_id, r.user_id, r.created_at, r.reason, r.student_note, r.status, r.final_mark from public.mark_reviews r where r.user_id = (select auth.uid());",
  );
  expect(sql).toContain(
    "revoke all on public.student_mark_reviews from public, anon, authenticated;",
  );
  expect(sql).toContain(
    "grant select on public.student_mark_reviews to authenticated;",
  );
});

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
