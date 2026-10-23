-- Disposable local Postgres only; no existing data required beyond migrations.
begin;
select set_config('claro.test_student_id', coalesce(nullif(current_setting('claro.test_student_id', true), ''),
  'd1000000-0000-4000-8000-000000000001'), true);
insert into auth.users(id) values (current_setting('claro.test_student_id')::uuid) on conflict do nothing;
select set_config('request.jwt.claim.sub', current_setting('claro.test_student_id'), true);
insert into public.topics(id,parent_id,name,sort)
values ('t1-d1-integrity','t1','Synthetic D1 integrity',98), ('t2-d1-other','t2','Synthetic D1 other',98);
insert into public.questions(id,type,topic_id,marks,stem,options,correct_index,criteria,sample_answer,source,year,origin,status,verb)
select 'd1-mc-'||i,'mcq','t1-d1-integrity',1,'Synthetic D1 MC question '||i,
  array['A','B','C','D'],0,null,null,'Synthetic Q'||i,2026,'claro','live',null
from generate_series(1,12) i;
insert into public.questions(id,type,topic_id,marks,stem,criteria,sample_answer,source,year,origin,status,verb)
select 'd1-short-'||i,'short','t1-d1-integrity',5,'Synthetic D1 short question '||i,
  '[{"min":1,"max":5,"descriptor":"Synthetic criteria"}]'::jsonb,'Synthetic sample',
  'Synthetic Q'||i,2026,'claro','live','explain'
from generate_series(1,8) i;
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
values ('d1-draft','short','t1-d1-integrity',5,'Synthetic D1 draft','[]','Synthetic draft',2026,'claro','draft'),
  ('d1-retired','short','t1-d1-integrity',5,'Synthetic D1 retired','[]','Synthetic retired',2026,'claro','retired'),
  ('d1-other','short','t2-d1-other',5,'Synthetic D1 other topic','[]','Synthetic other',2026,'claro','live'),
  ('d1-essay','extended','t1-d1-integrity',20,'Synthetic D1 essay','[]','Synthetic essay',2026,'claro','live');
-- Five seen/mistaken/flagged MCs and two written answers; others remain new.
do $$
declare s uuid;
begin
  insert into public.sessions(user_id,kind,config,finished_at)
  values (auth.uid(),'sprint','{"mode":"mixed"}',now()) returning id into s;
  insert into public.attempts(user_id,session_id,question_id,position,status,answer_text,choice_index,mark,max_marks,flagged)
  select auth.uid(),s,q.id,row_number() over(),'marked','Synthetic history',
    case when q.type='mcq' then 1 end,0,q.marks,true
  from public.questions q where q.id in ('d1-mc-1','d1-mc-2','d1-mc-3','d1-mc-4','d1-mc-5','d1-short-1','d1-short-2');
end $$;
set local role authenticated;
do $$
declare s uuid; cfg jsonb; mode_cfg jsonb; h text; a uuid; n int; qid text; col text;
begin
  if not has_column_privilege('authenticated','public.questions','status','SELECT')
    or not has_function_privilege('authenticated','public.sprint_questions(jsonb)','EXECUTE') then
    raise exception 'Policy dependencies unavailable to authenticated';
  end if;
  -- All current mode/size combinations, mixed buckets and history choices.
  for mode_cfg in select value from jsonb_array_elements('[
    {"mode":"mcq","size_by":"questions","target":5},
    {"mode":"short","size_by":"marks","target":10},
    {"mode":"short","size_by":"questions","target":2},
    {"mode":"mixed","target":10,"mcq_count":5,"short_marks":5},
    {"mode":"mixed","target":5,"mcq_count":5,"short_marks":0},
    {"mode":"mixed","target":10,"mcq_count":0,"short_marks":10}
  ]'::jsonb) loop
    foreach h in array array['prefer_new','new_only','mistakes','flagged','any'] loop
      cfg := mode_cfg || jsonb_build_object('topics',jsonb_build_array('t1'),
        'subtopics',jsonb_build_array('t1-d1-integrity'),'history',h,'timed',false);
      s := public.start_sprint(cfg);
      select count(*) into n from public.attempts where session_id=s;
      if n=0 then raise exception 'No attempts for %',cfg; end if;
      if exists (select 1 from public.attempts x join public.questions q on q.id=x.question_id
        where x.session_id=s and (q.status<>'live' or q.type='extended' or q.topic_id<>'t1-d1-integrity')) then
        raise exception 'Invalid question selected for %',cfg;
      end if;
    end loop;
  end loop;
  -- Written filters and feedback-each still take the same invoker insert path.
  s := public.start_sprint('{"mode":"short","size_by":"questions","target":2,
    "topics":["t1"],"subtopics":["t1-d1-integrity"],"difficulty":["standard"],
    "verbs":["explain"],"origins":["claro"],"feedback":"each"}');
  select id into strict a from public.attempts where session_id=s order by position limit 1;
  -- Legitimate direct answer saves, photos, transcripts and flags still work.
  update public.attempts set answer_text='Synthetic answer', transcript='Synthetic transcript',
    image_paths=array[auth.uid()::text||'/synthetic.png'],flagged=true where id=a;
  get diagnostics n = row_count;
  if n<>1 or not exists (select 1 from public.attempts where id=a and answer_version=1
    and answer_text='Synthetic answer' and transcript='Synthetic transcript' and flagged) then
    raise exception 'Legitimate answer update failed';
  end if;
  perform set_config('claro.d1_attempt_id',a::text,true);
  perform set_config('claro.d1_session_id',s::text,true);
  -- Existing column grants prevent all identity/marking changes, independently of RLS.
  foreach col in array array['question_id','session_id','user_id','position','status','mark','answer_version'] loop
    if has_column_privilege('authenticated','public.attempts',col,'UPDATE') then
      raise exception 'Unexpected authenticated UPDATE privilege on %',col;
    end if;
  end loop;
  foreach qid in array array['d1-draft','d1-retired'] loop
    begin
      update public.attempts set question_id=qid where id=a;
      raise exception 'Forged update to % accepted',qid;
    exception when insufficient_privilege then null; end;
  end loop;
  -- A manually created owned session cannot admit hidden or ineligible questions.
  insert into public.sessions(kind,config) values ('sprint',
    '{"mode":"mcq","topics":["t1"],"subtopics":["t1-d1-integrity"]}') returning id into s;
  foreach qid in array array['d1-draft','d1-retired','d1-short-8','d1-other','d1-essay'] loop
    begin
      insert into public.attempts(session_id,question_id,position) values (s,qid,1);
      raise exception 'Forged insert of % accepted',qid;
    exception when insufficient_privilege then null; end;
  end loop;
  -- Isolate individual eligibility filters (including history and no essays).
  for cfg,qid in select * from (values
    ('{"mode":"short","topics":["t1"]}'::jsonb,'d1-other'),
    ('{"mode":"short","marks_per_short":5}'::jsonb,'d1-short-8'),
    ('{"mode":"short","difficulty":["foundation"]}'::jsonb,'d1-short-8'),
    ('{"mode":"short","verbs":["describe"]}'::jsonb,'d1-short-8'),
    ('{"mode":"short","origins":["nesa"]}'::jsonb,'d1-short-8'),
    ('{"mode":"mcq","history":"new_only"}'::jsonb,'d1-mc-1'),
    ('{"mode":"mcq","history":"mistakes"}'::jsonb,'d1-mc-12'),
    ('{"mode":"mcq","history":"flagged"}'::jsonb,'d1-mc-12'),
    ('{"mode":"mixed","include_extended":true}'::jsonb,'d1-essay')
  ) cases(config,question_id) loop
    declare bad_session uuid;
    begin
      insert into public.sessions(kind,config) values ('sprint',cfg) returning id into bad_session;
      begin
        insert into public.attempts(session_id,question_id,position) values (bad_session,qid,1);
        raise exception 'Ineligible insert % accepted for %',qid,cfg;
      exception when insufficient_privilege then null; end;
    end;
  end loop;
  -- Eligible direct inserts still work and the answer ceiling is enforced.
  insert into public.attempts(session_id,question_id,position,choice_index,answer_text)
  values (s,'d1-mc-12',1,0,repeat('x',1000000)) returning id into a;
  update public.attempts set choice_index=1,answer_text=null where id=a;
  begin
    update public.attempts set answer_text=repeat('x',1000001) where id=a;
    raise exception 'Oversized answer update accepted';
  exception when check_violation then
    if sqlerrm not like '%attempts_answer_text_length%' then raise; end if;
  end;
  begin
    insert into public.attempts(session_id,question_id,position,answer_text)
    values (s,'d1-mc-11',2,repeat('x',1000001));
    raise exception 'Oversized answer insert accepted';
  exception when check_violation then
    if sqlerrm not like '%attempts_answer_text_length%' then raise; end if;
  end;
  -- No direct single-check sessions; flashcards do not insert attempts at all.
  begin
    insert into public.sessions(kind,config) values ('single','{}');
    raise exception 'Direct single session accepted';
  exception when insufficient_privilege then null; end;
  insert into public.sessions(kind,config) values ('flashcards','{}') returning id into s;
  begin
    insert into public.attempts(session_id,question_id,position) values (s,'d1-essay',1);
    raise exception 'Flashcard attempt accepted';
  exception when insufficient_privilege then null; end;
  insert into public.sessions(kind,config) values ('sprint','{"mode":"extended"}') returning id into s;
  begin
    insert into public.attempts(session_id,question_id,position) values (s,'d1-essay',1);
    raise exception 'Unsupported extended mode accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A dedicated large pool exercises the real builder ceilings, smaller targets,
-- bulk inserts, repeated positions and forged actual_questions values.
insert into public.topics(id,parent_id,name,sort) values ('t1-d1-bound','t1','Synthetic D1 bound',99);
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
select 'd1-bound-'||i,'short','t1-d1-bound',1,'Synthetic bound written '||i,
  '[]','Synthetic Q'||i,2026,'claro','live' from generate_series(1,110) i;
insert into public.questions(id,type,topic_id,marks,stem,options,correct_index,source,year,origin,status)
select 'd1-bound-mc-'||i,'mcq','t1-d1-bound',1,'Synthetic bound MC '||i,
  array['A','B','C','D'],0,'Synthetic Q'||i,2026,'claro','live' from generate_series(1,41) i;
set local role authenticated;
do $$
declare s uuid; cfg jsonb; qid text; a uuid; n int;
begin
  for cfg in select value from jsonb_array_elements('[
    {"mode":"mcq","target":40},
    {"mode":"short","size_by":"questions","target":2},
    {"mode":"short","size_by":"questions","target":15},
    {"mode":"short","size_by":"marks","target":60}
  ]'::jsonb) loop
    s := public.start_sprint(cfg || '{"topics":["t1"],"subtopics":["t1-d1-bound"]}'::jsonb);
    select count(*) into n from public.attempts where session_id=s;
    if n<>(cfg->>'target')::int then raise exception 'Maximum allocation changed: % / %',cfg,n; end if;
    select q.id into strict qid from public.questions q where q.topic_id='t1-d1-bound'
      and q.type=case when cfg->>'mode'='mcq' then 'mcq' else 'short' end
      and not exists (select 1 from public.attempts a where a.session_id=s and a.question_id=q.id) limit 1;
    begin
      insert into public.attempts(session_id,question_id,position) values (s,qid,1);
      raise exception 'Attempt beyond allocation accepted for %',cfg;
    exception when insufficient_privilege then null; end;
  end loop;
  -- The mixed tolerance permits at most target+2 attempts, even with a forged
  -- oversized target/actual count. Start itself still allocates its exact 100.
  s := public.start_sprint('{"mode":"mixed","target":100,"mcq_count":0,"short_marks":100,
    "topics":["t1"],"subtopics":["t1-d1-bound"]}');
  select count(*) into n from public.attempts where session_id=s;
  if n<>100 then raise exception 'Largest mixed allocation changed'; end if;
  for qid in select q.id from public.questions q where q.topic_id='t1-d1-bound' and q.type='short'
    and not exists (select 1 from public.attempts a where a.session_id=s and a.question_id=q.id) limit 2 loop
    insert into public.attempts(session_id,question_id,position) values (s,qid,1);
  end loop;
  select q.id into strict qid from public.questions q where q.topic_id='t1-d1-bound' and q.type='short'
    and not exists (select 1 from public.attempts a where a.session_id=s and a.question_id=q.id) limit 1;
  begin
    insert into public.attempts(session_id,question_id,position) values (s,qid,1);
    raise exception '103rd attempt accepted';
  exception when insufficient_privilege then null; end;
  insert into public.sessions(kind,config) values ('sprint',
    '{"mode":"short","size_by":"questions","target":2,"actual_questions":999999}') returning id into s;
  begin
    insert into public.attempts(session_id,question_id,position)
    select s,'d1-bound-'||i,1 from generate_series(1,3) i;
    raise exception 'Bulk insert exceeded smaller allocation';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.attempts where session_id=s) then raise exception 'Rejected batch was not atomic'; end if;
  insert into public.sessions(kind,config) values ('sprint',
    '{"mode":"mixed","target":2147483647,"actual_questions":2147483647}') returning id into s;
  insert into public.attempts(session_id,question_id,position)
    select s,'d1-bound-'||i,1 from generate_series(1,102) i;
  begin
    insert into public.attempts(session_id,question_id,position) values (s,'d1-bound-103',1);
    raise exception 'Forged target bypassed absolute ceiling';
  exception when insufficient_privilege then null; end;
  insert into public.sessions(kind,config) values ('sprint',
    '{"mode":"short","size_by":"questions","target":2}') returning id into s;
  insert into public.attempts(session_id,question_id,position) values (s,'d1-bound-1',1) returning id into a;
  update public.attempts set transcript=repeat('x',1000000),answer_text=null where id=a;
  begin
    update public.attempts set transcript=repeat('x',1000001) where id=a;
    raise exception 'Oversized transcript accepted';
  exception when check_violation then
    if sqlerrm not like '%attempts_transcript_length%' then raise; end if;
  end;
  update public.attempts set transcript=null where id=a;
end $$;
reset role;
-- A question may retire while a legitimate sprint is in progress. Preserve saves
-- and the complete review, including criteria/sample answers, after finishing.
update public.questions set status='retired'
where id=(select question_id from public.attempts where id=current_setting('claro.d1_attempt_id')::uuid);
set local role authenticated;
do $$
declare n int;
begin
  update public.attempts set answer_text='Answer after retirement'
  where id=current_setting('claro.d1_attempt_id')::uuid;
  get diagnostics n = row_count;
  if n<>1 then raise exception 'Retirement blocked a legitimate answer save'; end if;
end $$;
reset role;
update public.sessions set finished_at=now() where id=current_setting('claro.d1_session_id')::uuid;
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.session_review(current_setting('claro.d1_session_id')::uuid)
    where attempt_id=current_setting('claro.d1_attempt_id')::uuid
      and criteria is not null and sample_answer='Synthetic sample') then
    raise exception 'Retired question review lost legitimate answers';
  end if;
end $$;
reset role;
-- Service-created own-question and bank single checks bypass authenticated RLS.
set local role service_role;
do $$
declare s uuid;
begin
  insert into public.sessions(user_id,kind,config) values (auth.uid(),'single','{}') returning id into s;
  insert into public.attempts(user_id,session_id,question_id,position,answer_text)
  values (auth.uid(),s,null,1,'Synthetic own answer'),(auth.uid(),s,'d1-retired',2,'Synthetic bank answer');
  -- Transcript INSERT is service-only; CHECKs cover that path as well as client PATCHes.
  insert into public.attempts(user_id,session_id,question_id,position,transcript)
  values (auth.uid(),s,null,3,repeat('x',1000000));
  begin
    insert into public.attempts(user_id,session_id,question_id,position,transcript)
    values (auth.uid(),s,null,4,repeat('x',1000001));
    raise exception 'Oversized service transcript insert accepted';
  exception when check_violation then
    if sqlerrm not like '%attempts_transcript_length%' then raise; end if;
  end;
end $$;
rollback;
