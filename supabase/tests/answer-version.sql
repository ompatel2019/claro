-- Offline/local check after 0049; requires claro.test_student_id (synthetic profile).
-- Follows scripts/sql.sh's file format, but MUST NOT be run against production.
begin;
do $$
declare
  u uuid := current_setting('claro.test_student_id')::uuid;
  s uuid; a uuid; v integer; snapshot jsonb; result jsonb;
begin
  insert into public.topics(id,name,sort) values ('answer-version-test','Synthetic version topic',999);
  insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
    values ('answer-version-test','short','answer-version-test',4,'Synthetic version check','[]','Synthetic',2026,'claro','live');
  insert into public.sessions(user_id,kind,config) values (u,'sprint','{"feedback":"end"}') returning id into s;
  insert into public.attempts(user_id,session_id,question_id,position,answer_text)
    values (u,s,'answer-version-test',1,'Original synthetic answer') returning id into a;
  select answer_version into v from public.attempts where id = a;
  if v <> 0 then raise exception 'Legacy default must be zero'; end if;
  update public.attempts set answer_text = answer_text, flagged = true, answer_version = 99 where id = a;
  select answer_version into v from public.attempts where id = a;
  if v <> 0 then raise exception 'Non-answer updates must preserve version'; end if;
  insert into public.mark_reviews(attempt_id,user_id,reason,status,resolved_at)
    values (a,u,'check_disagreed','resolved',now());
  insert into public.mark_reviews(attempt_id,user_id,reason) values (a,u,'check_disagreed');
  update public.attempts set answer_text = 'Edited synthetic answer' where id = a;
  update public.attempts set transcript = 'Synthetic transcript' where id = a;
  update public.attempts set choice_index = 0 where id = a;
  update public.attempts set image_paths = array['synthetic/photo.png'] where id = a;
  select answer_version into v from public.attempts where id = a;
  if v <> 4 then raise exception 'All four answer fields must advance the version'; end if;
  update public.attempts set mark = 4, status = 'marked' where id = a and answer_version = 0;
  if found then raise exception 'Stale mark write must fail CAS'; end if;
  insert into public.mark_reviews(attempt_id,user_id,reason,answer_version)
    values (a,u,'check_disagreed',0);
  if found then raise exception 'Stale review must be discarded before uniqueness check'; end if;
  insert into public.mark_reviews(attempt_id,user_id,reason,answer_version)
    values (a,u,'check_disagreed',4);
  if (select count(*) from public.mark_reviews where attempt_id = a and status = 'open') <> 1
    or not exists (select 1 from public.mark_reviews where attempt_id = a and answer_version = 4) then
    raise exception 'Legacy open auto review must not block a new review';
  end if;
  snapshot := jsonb_build_object(a::text, jsonb_build_array(4,'pending',null,null));
  if not public.save_sprint_answer(a,u,4,'pending','{"answer_text":"New synthetic text"}') then
    raise exception 'Current save must succeed';
  end if;
  if exists (select 1 from public.mark_reviews where attempt_id = a and status = 'open') then
    raise exception 'An edit must remove stale open auto reviews even if the next mark agrees';
  end if;
  if not exists (select 1 from public.mark_reviews where attempt_id = a and status = 'resolved') then
    raise exception 'Resolved reviews must be preserved';
  end if;
  result := public.finish_versioned_session(s,snapshot,'{"score":0,"max_score":4,"summary":null}');
  if result is not null then raise exception 'Finish must reject a changed snapshot'; end if;
  snapshot := jsonb_build_object(a::text, jsonb_build_array(5,'pending',null,null));
  result := public.finish_versioned_session(s,snapshot,'{"score":0,"max_score":4,"summary":null}');
  if result->>'finished_at' is null then raise exception 'Stable snapshot must finish'; end if;
  if public.save_sprint_answer(a,u,5,'pending','{"answer_text":"Too late"}') then
    raise exception 'Save must recheck session-open after taking locks';
  end if;
  if has_function_privilege('authenticated','public.finish_versioned_session(uuid,jsonb,jsonb)','execute')
    or has_function_privilege('authenticated','public.save_sprint_answer(uuid,uuid,integer,text,jsonb)','execute') then
    raise exception 'Versioned write RPCs must remain service-only';
  end if;
end $$;
rollback;
