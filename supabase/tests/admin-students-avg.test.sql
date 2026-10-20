begin;
insert into auth.users (id) values
  ('c2000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000003');
update public.profiles set role = 'admin' where id = 'c2000000-0000-0000-0000-000000000001';
insert into public.topics (id, name, sort) values ('c2-avg', 'SQL average test', 999);
insert into public.questions (id, type, topic_id, marks, stem, criteria, source, year)
  values ('c2-avg', 'short', 'c2-avg', 4, 'SQL average fixture', '[]', 'SQL test', 2026);

do $$
declare
  s uuid;
  c record;
begin
  for c in select * from (values
    (2, 4, 'marked', 'agreed', now() - interval '1 hour', 'An answer', '{}'::jsonb),
    -- A No answer mark still contributes to the denominator, even with legacy answer text.
    (0, 6, 'marked', 'skipped', now() - interval '1 hour', 'Legacy text', '{"note":"No answer"}'::jsonb),
    (100, 100, 'failed', 'skipped', now() - interval '1 hour', null, '{"note":"No answer"}'::jsonb),
    (100, 100, 'marked', 'skipped', now() - interval '40 days', null, '{"note":"No answer"}'::jsonb),
    (100, 100, 'marked', 'skipped', now() + interval '1 day', null, '{"note":"No answer"}'::jsonb),
    (100, 0, 'marked', 'skipped', now() - interval '1 hour', null, '{"note":"No answer"}'::jsonb),
    (null, 100, 'marked', 'skipped', now() - interval '1 hour', null, '{"note":"No answer"}'::jsonb)
  ) cases(mark, max_marks, status, check_status, marked_at, answer_text, feedback) loop
    insert into public.sessions (user_id, kind) values ('c2000000-0000-0000-0000-000000000002', 'sprint') returning id into s;
    insert into public.attempts (session_id, user_id, question_id, position, mark, max_marks,
      status, check_status, marked_at, answer_text, feedback)
    values (s, 'c2000000-0000-0000-0000-000000000002', 'c2-avg', 1, c.mark, c.max_marks,
      c.status, c.check_status, c.marked_at, c.answer_text, c.feedback);
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);
do $$
declare r record;
begin
  select * into r from public.admin_student_rows() where id = 'c2000000-0000-0000-0000-000000000002';
  if not found or r.avg_30 is distinct from 20::numeric or r.answered is distinct from 1::bigint then
    raise exception 'all marked attempts must average to 20%%; answered must exclude No answer: %', row_to_json(r);
  end if;
  select * into r from public.admin_student_rows() where id = 'c2000000-0000-0000-0000-000000000003';
  if not found or r.avg_30 is not null or r.answered is distinct from 0::bigint then
    raise exception 'student without marks must have null average and zero answered';
  end if;
end $$;
rollback;
