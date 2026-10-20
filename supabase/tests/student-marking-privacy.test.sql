begin;
insert into auth.users (id) values
  ('c2000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000003');
update public.profiles set role = 'admin' where id = 'c2000000-0000-0000-0000-000000000001';
insert into public.topics (id, name, sort) values ('c2-privacy', 'SQL privacy test', 999);
insert into public.questions (id, type, topic_id, marks, stem, criteria, sample_answer, source, year)
  values ('c2-privacy', 'short', 'c2-privacy', 4, 'SQL privacy fixture', '[]', 'Sample', 'SQL test', 2026);
insert into public.sessions (id, user_id, kind, finished_at) values
  ('c2000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000002', 'sprint', now()),
  ('c2000000-0000-0000-0000-000000000012', 'c2000000-0000-0000-0000-000000000003', 'sprint', now()),
  ('c2000000-0000-0000-0000-000000000013', 'c2000000-0000-0000-0000-000000000002', 'sprint', null);
insert into public.attempts (id, session_id, user_id, question_id, position, status, mark, max_marks, feedback) values
  ('c2000000-0000-0000-0000-000000000021', 'c2000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000002', 'c2-privacy', 1, 'marked', 3, 4,
    '{"note":"Keep this","flags":{"uncertain":true,"marks":[1,2],"keep":true},"other":{"marks":4}}'),
  ('c2000000-0000-0000-0000-000000000022', 'c2000000-0000-0000-0000-000000000012', 'c2000000-0000-0000-0000-000000000003', 'c2-privacy', 1, 'marked', 2, 4, '{"note":"Unchanged"}'),
  ('c2000000-0000-0000-0000-000000000023', 'c2000000-0000-0000-0000-000000000013', 'c2000000-0000-0000-0000-000000000002', 'c2-privacy', 1, 'pending', null, 4, null);
insert into public.mark_reviews (id, attempt_id, user_id, reason, ai_mark, check_mark, check_notes, status, final_mark, resolved_at) values
  ('c2000000-0000-0000-0000-000000000031', 'c2000000-0000-0000-0000-000000000021', 'c2000000-0000-0000-0000-000000000002', 'check_disagreed', 1, 2, 'Private checker diagnostics', 'resolved', 3, now()),
  ('c2000000-0000-0000-0000-000000000032', 'c2000000-0000-0000-0000-000000000022', 'c2000000-0000-0000-0000-000000000003', 'check_disagreed', 2, 3, 'Other private diagnostics', 'open', null, null);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000002', true);
do $$
declare r record; safe jsonb;
begin
  if not (select coalesce(reloptions @> array['security_barrier=true'], false)
    from pg_class where oid = 'public.student_mark_reviews'::regclass) then
    raise exception 'student_mark_reviews must retain its security barrier';
  end if;
  select * into r from public.session_review('c2000000-0000-0000-0000-000000000011');
  if not found or r.feedback is distinct from '{"note":"Keep this","flags":{"keep":true},"other":{"marks":4}}'::jsonb
    or r.review is distinct from '{"status":"resolved","reason":"check_disagreed","final_mark":3}'::jsonb
    or to_jsonb(r) ?| array['ai_mark','check_mark'] then
    raise exception 'session_review must remove private pass marks and feedback flags while preserving safe JSON: %', row_to_json(r);
  end if;
  if exists (select 1 from public.session_review('c2000000-0000-0000-0000-000000000012')) then
    raise exception 'session_review exposed another student session';
  end if;
  if exists (select 1 from public.session_review('c2000000-0000-0000-0000-000000000013')) then
    raise exception 'session_review exposed an unfinished session';
  end if;
  -- RLS must hide BOTH the student's own raw rows and other students' rows.
  if exists (select 1 from public.mark_reviews) then
    raise exception 'student can read own or other raw mark_reviews';
  end if;
  select to_jsonb(v) into safe from public.student_mark_reviews v
    where id = 'c2000000-0000-0000-0000-000000000031';
  if not found or not (safe ?& array['id','attempt_id','user_id','created_at','reason','student_note','status','final_mark'])
    or safe - array['id','attempt_id','user_id','created_at','reason','student_note','status','final_mark'] <> '{}'::jsonb
    or safe->>'final_mark' is distinct from '3' or safe->>'reason' is distinct from 'check_disagreed'
    or safe->>'status' is distinct from 'resolved' then
    raise exception 'owned safe review columns must remain readable without internal fields: %', safe;
  end if;
  if (select count(*) from public.student_mark_reviews) <> 1 then
    raise exception 'safe view must expose only the owned review';
  end if;
end $$;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);
do $$
begin
  if (select count(*) from public.mark_reviews) <> 2 then
    raise exception 'admins must retain access to raw reviews';
  end if;
end $$;
set local role anon;
do $$
begin
  if has_function_privilege(current_user, 'public.session_review(uuid)', 'execute') then
    raise exception 'anon can execute session_review';
  end if;
  begin
    perform * from public.session_review('c2000000-0000-0000-0000-000000000011');
    raise exception 'anon can execute session_review';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.student_mark_reviews;
    raise exception 'anon can select student_mark_reviews';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Reapply the actual migration to legacy feedback, then prove it is idempotent.
-- Runtime checks above run first so this cannot mask a broken policy or RPC.
\ir ../migrations/0048_student_marking_privacy.sql
do $$
begin
  if (select feedback from public.attempts where id = 'c2000000-0000-0000-0000-000000000021')
    is distinct from '{"note":"Keep this","flags":{"keep":true},"other":{"marks":4}}'::jsonb
    or (select feedback from public.attempts where id = 'c2000000-0000-0000-0000-000000000022')
      is distinct from '{"note":"Unchanged"}'::jsonb
    or (select feedback from public.attempts where id = 'c2000000-0000-0000-0000-000000000023') is not null then
    raise exception '0048 cleanup must remove only legacy feedback flags';
  end if;
end $$;
create temporary table c2_feedback_snapshot as select id, feedback from public.attempts;
\ir ../migrations/0048_student_marking_privacy.sql
do $$
begin
  if exists (select 1 from public.attempts a join c2_feedback_snapshot s using (id) where a.feedback is distinct from s.feedback) then
    raise exception '0048 feedback cleanup must be idempotent';
  end if;
end $$;
rollback;
