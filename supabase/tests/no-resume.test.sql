-- 0084 no resume: last-activity rule, Activity lists finished sessions only, and the one-off
-- backfill script runs cleanly (it rolls itself back by default).
begin;
insert into auth.users (id) values ('d1000000-0000-4000-8000-000000000001');
insert into public.profiles (id, full_name) values ('d1000000-0000-4000-8000-000000000001', 'Synthetic student')
  on conflict (id) do nothing;
insert into public.topics(id, name, sort) values ('nr', 'No resume fixture', 998);
insert into public.questions(id,type,topic_id,marks,stem,options,correct_index,source,year,origin,status)
values ('nr-mc','mcq','nr',1,'Synthetic MC',array['A','B','C','D'],0,'Synthetic',2020,'claro','live');
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
values ('nr-short','short','nr',4,'Synthetic short','[]'::jsonb,'Synthetic',2026,'claro','live');
insert into public.sessions(id,user_id,kind,config,started_at,elapsed_s,finished_at) values
  ('d1000000-0000-4000-8000-0000000000a1','d1000000-0000-4000-8000-000000000001','sprint','{"mode":"mixed","feedback":"end"}', now() - interval '3 hours', 600, null),
  ('d1000000-0000-4000-8000-0000000000a2','d1000000-0000-4000-8000-000000000001','sprint','{"mode":"mixed","feedback":"end"}', now() - interval '3 hours', 10500, null),
  ('d1000000-0000-4000-8000-0000000000a3','d1000000-0000-4000-8000-000000000001','sprint','{"mode":"mixed","feedback":"end"}', now() - interval '3 hours', 60, now() - interval '2 hours');
insert into public.attempts(session_id,user_id,question_id,position,choice_index,answer_text,status,marked_at) values
  ('d1000000-0000-4000-8000-0000000000a1','d1000000-0000-4000-8000-000000000001','nr-mc',1,0,null,'pending',null),
  ('d1000000-0000-4000-8000-0000000000a1','d1000000-0000-4000-8000-000000000001','nr-short',2,null,'too short','pending',null),
  ('d1000000-0000-4000-8000-0000000000a3','d1000000-0000-4000-8000-000000000001','nr-mc',1,0,null,'marked',now() - interval '2 hours');
do $$
declare
  stale timestamptz;
  live timestamptz;
  listed jsonb;
begin
  select public.session_last_active_at(s) into stale from public.sessions s where id = 'd1000000-0000-4000-8000-0000000000a1';
  select public.session_last_active_at(s) into live from public.sessions s where id = 'd1000000-0000-4000-8000-0000000000a2';
  if stale > now() - interval '2 hours' or live < now() - interval '10 minutes' then
    raise exception 'Last activity mismatch: % / %', stale, live;
  end if;
  -- A background mark is activity too.
  update public.attempts set marked_at = now() - interval '1 minute'
    where session_id = 'd1000000-0000-4000-8000-0000000000a1' and position = 1;
  select public.session_last_active_at(s) into stale from public.sessions s where id = 'd1000000-0000-4000-8000-0000000000a1';
  if stale < now() - interval '5 minutes' then raise exception 'Marks are not activity'; end if;
  update public.attempts set marked_at = null
    where session_id = 'd1000000-0000-4000-8000-0000000000a1' and position = 1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
  listed := public.activity_stats('{}'::jsonb, '{}'::jsonb);
  if jsonb_array_length(listed->'rows') <> 1 or listed->'rows'->0->>'id' <> 'd1000000-0000-4000-8000-0000000000a3'
    or (listed->>'all_total')::int <> 1 then
    raise exception 'Activity must list finished sessions only: %', listed;
  end if;
  reset role;
end $$;
commit;

\ir ../backfills/0084_finish_open_sessions.sql

do $$
begin
  if exists (select 1 from public.sessions where user_id = 'd1000000-0000-4000-8000-000000000001'
      and finished_at is null and id = 'd1000000-0000-4000-8000-0000000000a1') is not true then
    raise exception 'The backfill must roll back unless the PM commits it';
  end if;
end $$;
