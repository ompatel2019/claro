begin;
insert into auth.users (id) values ('c9000000-0000-4000-8000-000000000009');
insert into public.topics(id, name, sort) values ('s9', 'Sprint marks fixture', 999);
insert into public.questions(id,type,topic_id,marks,stem,options,correct_index,source,year,origin,status)
select 's9-mc-'||i,'mcq','s9',1,'Synthetic MC',array['A','B','C','D'],0,'Synthetic Q'||i,2020,'claro','live'
from generate_series(1,6) i;
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
select 's9-short-'||m||'-'||i,'short','s9',m,'Synthetic short','[]'::jsonb,'Synthetic Q'||i,2026,'claro','live'
from unnest(array[2,5]) m cross join generate_series(1,6) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9000000-0000-4000-8000-000000000009', true);
do $$
declare
  cfg jsonb := '{"mode":"mixed","topics":["s9"],"size_by":"questions","target":7,"mcq_count":3,"short_count":4,"marks_per_short":5}';
  pool jsonb;
  saved jsonb;
  session uuid;
  mc int;
  shorts int;
  bad jsonb;
begin
  pool := public.sprint_pool(cfg);
  if (pool->>'questions')::int <> 12 or (pool->>'short_questions')::int <> 6
    or (pool->>'short_marks')::int <> 30 or pool->'short_mark_values' <> '{"2":6,"5":6}'::jsonb then
    raise exception 'Filtered pool/mark options mismatch: %', pool;
  end if;
  if exists(select 1 from public.sprint_questions(cfg) q where q.type='short' and q.marks<>5) then
    raise exception 'Short mark filter leaked';
  end if;
  -- Year keys, including malformed values, are inert; metadata still carries years.
  if public.sprint_pool(cfg || '{"year_from":"ignored","year_to":1900}') <> pool then
    raise exception 'Retired year keys still filter';
  end if;
  if not exists(select 1 from public.sprint_questions(cfg) q where q.year=2020) then
    raise exception 'Question year metadata lost';
  end if;
  session := public.start_sprint(cfg || '{"year_from":2099,"year_to":1900}');
  select config into saved from public.sessions where id=session;
  select count(*) filter(where q.type='mcq'), count(*) filter(where q.type='short') into mc, shorts
    from public.attempts a join public.questions q on q.id=a.question_id where a.session_id=session;
  if mc<>3 or shorts<>4 or (saved->>'actual_marks')::int<>23 or (saved->>'time_limit_s')::int<>1980
    or saved ? 'year_from' or saved ? 'year_to' or (saved->>'actual_short_count')::int<>4 then
    raise exception 'Mixed must select short QUESTIONS and compute actual marks/pace: %', saved;
  end if;
  session := public.start_sprint('{"mode":"short","topics":["s9"],"size_by":"questions","target":3,"marks_per_short":2}');
  if exists(select 1 from public.attempts a join public.questions q on q.id=a.question_id where a.session_id=session and q.marks<>2) then
    raise exception 'Short-only mark filter leaked';
  end if;
  -- The attempt guard also rejects a mismatched short in an owned session.
  insert into public.sessions(kind,config) values ('sprint',
    '{"mode":"short","topics":["s9"],"marks_per_short":2}') returning id into session;
  begin
    insert into public.attempts(session_id,question_id,position) values (session,'s9-short-5-1',1);
    raise exception 'Mismatched short mark insert accepted';
  exception when insufficient_privilege then null; end;
  -- A matching short is eligible under the same session configuration.
  insert into public.attempts(session_id,question_id,position) values (session,'s9-short-2-1',1);
  -- Insufficient shorts do not become MC questions.
  session := public.start_sprint(cfg || '{"target":13,"short_count":10}');
  select config into saved from public.sessions where id=session;
  if (saved->>'actual_short_count')::int<>6 or (saved->>'actual_mcq_count')::int<>3 then
    raise exception 'Mixed shortfall spilled across buckets';
  end if;
  session := public.start_sprint(cfg || '{"target":5,"mcq_count":5,"short_count":0}');
  select config into saved from public.sessions where id=session;
  if (saved->>'actual_short_count')::int<>0 or (saved->>'actual_mcq_count')::int<>5 then
    raise exception 'Zero short bucket ignored';
  end if;
  session := public.start_sprint(cfg || '{"target":5,"mcq_count":0,"short_count":5}');
  select config into saved from public.sessions where id=session;
  if (saved->>'actual_short_count')::int<>5 or (saved->>'actual_mcq_count')::int<>0 then
    raise exception 'Zero MC bucket ignored';
  end if;
  -- Saved mark-budget sessions continue to start.
  session := public.start_sprint('{"mode":"mixed","topics":["s9"],"target":15,"mcq_count":5,"short_marks":10,"marks_per_short":5}');
  select config into saved from public.sessions where id=session;
  if (saved->>'actual_short_marks')::int<>10 then raise exception 'Legacy mark budget broken'; end if;
  foreach bad in array array[
    '{"marks_per_short":"5"}', '{"marks_per_short":0}', '{"marks_per_short":101}', '{"marks_per_short":2.5}',
    '{"short_count":null}', '{"short_count":"4"}', '{"short_count":-1}', '{"short_count":16}', '{"short_count":1.5}'
  ]::jsonb[] loop
    begin
      perform public.sprint_pool(cfg || bad);
      raise exception 'bad pool config accepted: %', bad;
    exception when raise_exception then
      if sqlerrm not like 'invalid %' then raise; end if;
    end;
    begin
      perform public.start_sprint(cfg || bad);
      raise exception 'bad start config accepted: %', bad;
    exception when raise_exception then
      if sqlerrm not like 'invalid %' then raise; end if;
    end;
  end loop;
  foreach bad in array array['{"target":4,"mcq_count":2,"short_count":2}', '{"mcq_count":1.5}', '{"mcq_count":null}', '{"target":45,"mcq_count":41}', '{"target":8}']::jsonb[] loop
    begin
      perform public.start_sprint(cfg || bad);
      raise exception 'bad mixed config accepted: %', bad;
    exception when raise_exception then
      if sqlerrm not like 'invalid %' and sqlerrm <> 'size is out of range' then raise; end if;
    end;
  end loop;
end $$;
rollback;
