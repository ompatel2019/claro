-- 0085: a sprint whose Finish is under way is listed on Activity as Marking with no score;
-- open sprints stay hidden and students cannot set the lease themselves.
begin;
insert into auth.users (id) values ('d1600000-0000-4000-8000-000000000001');
insert into public.profiles (id, full_name) values ('d1600000-0000-4000-8000-000000000001', 'Synthetic student')
  on conflict (id) do nothing;
insert into public.topics(id, name, sort) values ('fr', 'Finish requested fixture', 997);
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
values ('fr-short','short','fr',4,'Synthetic short','[]'::jsonb,'Synthetic',2026,'claro','live');
insert into public.sessions(id,user_id,kind,config,started_at,elapsed_s,finished_at,finish_requested_at,score,max_score) values
  -- Being marked: Finish claimed, not finished.
  ('d1600000-0000-4000-8000-0000000000a1','d1600000-0000-4000-8000-000000000001','sprint','{"mode":"short","feedback":"end"}', now() - interval '10 minutes', 300, null, now() - interval '1 minute', null, null),
  -- Still being answered.
  ('d1600000-0000-4000-8000-0000000000a2','d1600000-0000-4000-8000-000000000001','sprint','{"mode":"short","feedback":"end"}', now() - interval '5 minutes', 60, null, null, null, null),
  -- Finished after a Finish run: scored as before.
  ('d1600000-0000-4000-8000-0000000000a3','d1600000-0000-4000-8000-000000000001','sprint','{"mode":"short","feedback":"end"}', now() - interval '3 hours', 60, now() - interval '2 hours', now() - interval '2 hours', 3, 4),
  -- Only sprints are listed while unfinished.
  ('d1600000-0000-4000-8000-0000000000a4','d1600000-0000-4000-8000-000000000001','flashcards','{"mode":"test"}', now() - interval '4 minutes', 60, null, now() - interval '1 minute', null, null);
insert into public.attempts(session_id,user_id,question_id,position,answer_text,status,mark,max_marks,marked_at) values
  ('d1600000-0000-4000-8000-0000000000a1','d1600000-0000-4000-8000-000000000001','fr-short',1,'A synthetic written answer','marked',4,4,now()),
  ('d1600000-0000-4000-8000-0000000000a3','d1600000-0000-4000-8000-000000000001','fr-short',1,'A synthetic written answer','marked',3,4,now() - interval '2 hours');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1600000-0000-4000-8000-000000000001', true);
do $$
declare
  listed jsonb;
  marking jsonb;
begin
  listed := public.activity_stats('{}'::jsonb, '{}'::jsonb);
  if jsonb_array_length(listed->'rows') <> 2 or (listed->>'all_total')::int <> 2 then
    raise exception 'Activity must list finished and marking sprints only: %', listed;
  end if;
  select r into marking from jsonb_array_elements(listed->'rows') r
    where r->>'id' = 'd1600000-0000-4000-8000-0000000000a1';
  if marking->>'status' <> 'Marking' or marking->'pct' <> 'null'::jsonb
    or marking->'finished_at' <> 'null'::jsonb then
    raise exception 'A sprint being marked shows Marking with no score: %', marking;
  end if;
  if (listed->'stats'->>'best')::numeric <> 75 then
    raise exception 'Marking rows stay out of the score stats: %', listed->'stats';
  end if;
  listed := public.activity_stats('{"status":"marking"}'::jsonb, '{}'::jsonb);
  if jsonb_array_length(listed->'rows') <> 1 or listed->'rows'->0->>'id' <> 'd1600000-0000-4000-8000-0000000000a1' then
    raise exception 'Marking filter mismatch: %', listed;
  end if;
  listed := public.activity_stats('{"status":"finished"}'::jsonb, '{}'::jsonb);
  if jsonb_array_length(listed->'rows') <> 1 or listed->'rows'->0->>'id' <> 'd1600000-0000-4000-8000-0000000000a3' then
    raise exception 'Finished filter mismatch: %', listed;
  end if;
  begin
    update public.sessions set finish_requested_at = now()
      where id = 'd1600000-0000-4000-8000-0000000000a2';
    raise exception 'Students must not set finish_requested_at';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
