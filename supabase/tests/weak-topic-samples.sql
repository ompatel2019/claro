-- Run after migration 0047 with scripts/sql.sh. Everything is rolled back.
begin;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000171', '{}'),
  ('00000000-0000-4000-8000-000000000172', '{}');
insert into public.topics (id, parent_id, name, sort) values
  ('synthetic-history-parent', null, 'Synthetic history', 99),
  ('synthetic-history-child', 'synthetic-history-parent', 'Synthetic sample', 99),
  ('synthetic-history-sibling', 'synthetic-history-parent', 'Synthetic sibling', 99);
insert into public.sessions (id, user_id, kind, config) values
  ('00000000-0000-4000-8000-000000000173', '00000000-0000-4000-8000-000000000171', 'single', '{"question":{"topic_id":"synthetic-history-child","marks":5}}'),
  ('00000000-0000-4000-8000-000000000174', '00000000-0000-4000-8000-000000000171', 'single', '{"question":{"topic_id":"synthetic-history-child","marks":5}}'),
  ('00000000-0000-4000-8000-000000000175', '00000000-0000-4000-8000-000000000171', 'single', '{"question":{"topic_id":"synthetic-history-sibling","marks":5}}'),
  ('00000000-0000-4000-8000-000000000176', '00000000-0000-4000-8000-000000000172', 'single', '{"question":{"topic_id":"synthetic-history-child","marks":5}}');
insert into public.attempts (session_id, user_id, position, answer_text, transcript, image_paths, status, mark, max_marks, marked_at, feedback) values
  ('00000000-0000-4000-8000-000000000173', '00000000-0000-4000-8000-000000000171', 1, 'Synthetic answer', null, null, 'marked', 1, 5, '2026-10-13T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000173', '00000000-0000-4000-8000-000000000171', 2, null, 'Synthetic transcript', null, 'marked', 2, 5, '2026-10-13T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000173', '00000000-0000-4000-8000-000000000171', 3, '  ', null, null, 'marked', 0, 5, '2026-10-13T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000174', '00000000-0000-4000-8000-000000000171', 1, null, null, '{synthetic.png}', 'marked', 1, 5, '2026-10-14T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000174', '00000000-0000-4000-8000-000000000171', 2, 'Synthetic answer', null, null, 'marked', 0, 5, '2026-10-14T01:00:00Z', '{"note":"No answer"}'),
  ('00000000-0000-4000-8000-000000000174', '00000000-0000-4000-8000-000000000171', 3, 'Synthetic answer', null, null, 'failed', null, 5, '2026-10-14T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000174', '00000000-0000-4000-8000-000000000171', 4, 'Synthetic answer', null, null, 'marked', 0, 0, '2026-10-14T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000174', '00000000-0000-4000-8000-000000000171', 5, 'Synthetic future answer', null, null, 'marked', 0, 5, '2026-10-14T13:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000175', '00000000-0000-4000-8000-000000000171', 1, 'Synthetic sibling answer', null, null, 'marked', 1, 5, '2026-10-14T01:00:00Z', '{}'),
  ('00000000-0000-4000-8000-000000000176', '00000000-0000-4000-8000-000000000172', 1, 'Other synthetic student', null, null, 'marked', 5, 5, '2026-10-14T01:00:00Z', '{}');
-- A bank answer in the same session as the child must not double count its parent session.
insert into public.questions (id, type, topic_id, marks, stem, source, year, options, correct_index)
values ('synthetic-history-question', 'mcq', 'synthetic-history-sibling', 1, 'Synthetic stem', 'Synthetic test', 2026, array['A','B','C','D'], 0);
insert into public.attempts (session_id, user_id, question_id, position, choice_index, status, mark, max_marks, marked_at)
values ('00000000-0000-4000-8000-000000000173', '00000000-0000-4000-8000-000000000171', 'synthetic-history-question', 4, 0, 'marked', 0, 1, '2026-10-13T01:00:00Z');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000171', true);
set local role authenticated;
do $$
declare row jsonb; report jsonb;
begin
  report := public.student_progress(null, '2026-10-14');
  if (report -> 'stats' ->> 'answered')::int <> 5 or (report -> 'stats' ->> 'possible')::int <> 31 then
    raise exception 'Legacy overview totals must remain compatible: %', report -> 'stats';
  end if;
  select t into row from jsonb_array_elements(report -> 'topics') t where t ->> 'id' = 'synthetic-history-child';
  if (row ->> 'answered')::int <> 3 or (row ->> 'sessions')::int <> 2 then
    raise exception 'Child history incorrect: %', row;
  end if;
  if (row ->> 'earned')::int <> 4 or (row ->> 'possible')::int <> 25 then
    raise exception 'Weighted marks changed: %', row;
  end if;
  select t into row from jsonb_array_elements(report -> 'topics') t where t ->> 'id' = 'synthetic-history-parent';
  if (row ->> 'answered')::int <> 5 or (row ->> 'sessions')::int <> 3 then
    raise exception 'Parent must count distinct sessions across children: %', row;
  end if;
  report := public.student_progress('2026-10-14', '2026-10-14');
  select t into row from jsonb_array_elements(report -> 'topics') t where t ->> 'id' = 'synthetic-history-child';
  if (row ->> 'answered')::int <> 1 or (row ->> 'sessions')::int <> 1 then
    raise exception 'Range must use inclusive Sydney dates: %', row;
  end if;
  report := public.student_progress('2026-11-01', '2026-11-02');
  select t into row from jsonb_array_elements(report -> 'topics') t where t ->> 'id' = 'synthetic-history-child';
  if (row ->> 'answered')::int <> 0 or (row ->> 'sessions')::int <> 0 or row ->> 'pct' is not null then
    raise exception 'Empty range incorrect: %', row;
  end if;
  if has_function_privilege('anon', 'public.student_progress(date,date)', 'execute') then
    raise exception 'Anonymous execution must stay revoked';
  end if;
end $$;
rollback;
