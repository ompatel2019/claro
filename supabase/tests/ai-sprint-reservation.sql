-- Disposable local Postgres only. Predicate cases mirror needsAiFinish's JS
-- nullish/trim/word-count/No answer rules; no answers leave the database.
begin;
insert into auth.users(id) values
  ('d4000000-0000-4000-8000-000000000071'),
  ('d4000000-0000-4000-8000-000000000072');
update public.profiles set role = 'admin' where id = 'd4000000-0000-4000-8000-000000000072';
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,status)
values ('d4-daily-short','short','t1',5,'Synthetic daily question','[]','Synthetic',2026,'retired'),
  ('d4-daily-second','extended','t1',20,'Synthetic second question','[]','Synthetic',2026,'live');
insert into public.questions(id,type,topic_id,marks,stem,options,correct_index,source,year,status)
values ('d4-daily-mcq','mcq','t1',1,'Synthetic MCQ',array['A','B','C','D'],0,'Synthetic',2026,'live');
insert into public.sessions(id,user_id,kind,finished_at)
select md5('d4-daily-'||i)::uuid,'d4000000-0000-4000-8000-000000000071','sprint',now()
from generate_series(1,199) i;
insert into public.attempts(user_id,session_id,question_id,position,status,answer_text)
select user_id,id,'d4-daily-short',1,'marked','Synthetic answer' from public.sessions
where user_id = 'd4000000-0000-4000-8000-000000000071';
insert into public.sessions(id,user_id,kind) values
  (md5('d4-daily-target')::uuid,'d4000000-0000-4000-8000-000000000071','sprint'),
  (md5('d4-daily-other')::uuid,'d4000000-0000-4000-8000-000000000071','sprint'),
  (md5('d4-daily-admin')::uuid,'d4000000-0000-4000-8000-000000000072','sprint');
insert into public.sessions(id,user_id,kind,finished_at)
values (md5('d4-daily-case')::uuid,'d4000000-0000-4000-8000-000000000071','sprint',now());
select set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000071',true);
set local role authenticated;
do $$ begin
  begin
    perform public.session_needs_ai_finish(md5('d4-daily-target')::uuid,auth.uid());
    raise exception 'Authenticated callers must not inspect AI predicate';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_ai_sprint(auth.uid(),md5('d4-daily-target')::uuid);
    raise exception 'Authenticated callers must not reserve daily capacity';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare
  u uuid := 'd4000000-0000-4000-8000-000000000071';
  target uuid := md5('d4-daily-target')::uuid;
  c uuid := md5('d4-daily-case')::uuid;
  r jsonb; other jsonb; test record;
  midnight timestamptz := date_trunc('day',clock_timestamp() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney';
begin
  if has_function_privilege('anon','public.reserve_ai_sprint(uuid,uuid)','execute')
    or has_function_privilege('anon','public.session_needs_ai_finish(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.session_needs_ai_finish(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.reserve_ai_sprint(uuid,uuid)','execute') then
    raise exception 'Daily RPC ACL regression';
  end if;
  if public.session_needs_ai_finish(c,u) then raise exception 'Empty session needs no AI'; end if;
  -- At 199, this additional completed session either fills the cap or does not.
  for test in select * from (values
    ('pending three words','pending','one two three',null,null,'d4-daily-short',true),
    ('pending two words','pending','two words',null,null,'d4-daily-short',false),
    ('empty','pending','',null,null,'d4-daily-short',false),
    ('null answer','pending',null,null,null,'d4-daily-short',false),
    ('blank','pending',E' \t\n',null,null,'d4-daily-short',false),
    ('transcript','transcribed',null,'one two three',null,'d4-daily-short',true),
    ('transcript precedence','pending','one two three','two words',null,'d4-daily-short',false),
    ('empty transcript precedence','pending','one two three','',null,'d4-daily-short',false),
    ('whitespace transcript precedence','marked','Answer',' ',null,'d4-daily-short',false),
    ('marked summary','marked','Answer',null,null,'d4-daily-short',true),
    ('marked no answer','marked','one two three',null,'{"note":"No answer"}','d4-daily-short',false),
    ('marked no answer transcript','marked',null,'one two three','{"note":"No answer"}','d4-daily-short',false),
    ('case-sensitive note','marked','Answer',null,'{"note":"no answer"}','d4-daily-short',true),
    ('null note','marked','Answer',null,'{"note":null}','d4-daily-short',true),
    ('unmarked note ignored','failed','one two three',null,'{"note":"No answer"}','d4-daily-short',true),
    ('marked blank','marked',E' \t\n',null,null,'d4-daily-short',false),
    ('MCQ excluded','marked','one two three',null,null,'d4-daily-mcq',false),
    ('extended','pending','one two three',null,null,'d4-daily-second',true),
    ('JS unicode trim','marked',U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF',null,null,'d4-daily-short',false),
    ('JS unicode words','pending',U&'one\00A0two\FEFFthree',null,null,'d4-daily-short',true),
    ('JS excludes next-line','pending',U&'one\0085two three',null,null,'d4-daily-short',false),
    ('large pending single word','pending',repeat('x',1000000),null,null,'d4-daily-short',false),
    ('large pending words','pending',repeat('a ',499999)||'a',null,null,'d4-daily-short',true),
    ('large answer','marked',repeat('x',1000000),null,null,'d4-daily-short',true)
  ) as cases(label,status,answer,transcript,feedback,question,expected) loop
    delete from public.attempts where session_id=c;
    insert into public.attempts(user_id,session_id,question_id,position,status,answer_text,transcript,feedback)
      values (u,c,test.question,1,test.status,test.answer,test.transcript,test.feedback::jsonb);
    if public.session_needs_ai_finish(c,u) <> test.expected
      or public.session_needs_ai_finish(c,'d4000000-0000-4000-8000-000000000072') then
      raise exception 'Initial AI predicate mismatch for %',test.label;
    end if;
    r := public.reserve_ai_sprint(u,target);
    if (r->>'ok')::boolean = test.expected then
      raise exception 'Predicate mismatch for %: %',test.label,r;
    end if;
    delete from public.ai_usage_reservations where user_id=u;
  end loop;
  -- Multiple written attempts and MCQs in one sprint still consume one slot.
  update public.attempts set answer_text='one two three',transcript=null,status='marked' where session_id=c;
  insert into public.attempts(user_id,session_id,question_id,position,status,answer_text)
    values (u,c,'d4-daily-second',2,'marked','Answer'),(u,c,'d4-daily-mcq',3,'marked','Answer');
  if (public.reserve_ai_sprint(u,target)->>'ok')::boolean then raise exception 'Mixed sprint must fill cap'; end if;
  update public.sessions set finished_at=midnight - interval '1 microsecond' where id=c;
  r := public.reserve_ai_sprint(u,target);
  if not (r->>'ok')::boolean then raise exception 'Yesterday must not count'; end if;
  delete from public.ai_usage_reservations where user_id=u;
  update public.sessions set finished_at=midnight where id=c;
  if (public.reserve_ai_sprint(u,target)->>'ok')::boolean then raise exception 'Sydney midnight must count'; end if;
  -- Other session kinds never consume sprint capacity.
  update public.sessions set kind='flashcards' where id=c;
  r := public.reserve_ai_sprint(u,target);
  if not (r->>'ok')::boolean then raise exception 'Flashcards must not count'; end if;
  -- A same-session retry owns a separate reservation but shares a daily slot.
  other := public.reserve_ai_sprint(u,target);
  if not (other->>'ok')::boolean or r->>'reservationId'=other->>'reservationId' then raise exception 'Retry must share capacity safely'; end if;
  delete from public.ai_usage_reservations where id=(r->>'reservationId')::uuid;
  if (public.reserve_ai_sprint(u,md5('d4-daily-other')::uuid)->>'ok')::boolean then raise exception 'Retry cleanup released active slot'; end if;
  -- Usage logging must leave the daily reservation until the session finishes.
  perform public.record_reserved_ai_usage(array[(other->>'reservationId')::uuid],
    jsonb_build_object('user_id',u,'task','mark-written','model','synthetic','input_tokens',1,'cached_tokens',0,'output_tokens',1,'usd',0));
  if not exists (select 1 from public.ai_usage_reservations where id=(other->>'reservationId')::uuid) then raise exception 'Provider usage released daily slot'; end if;
  update public.sessions set finished_at=now() where id=target;
  insert into public.attempts(user_id,session_id,question_id,position,status,answer_text)
    values(u,target,'d4-daily-short',1,'marked','Answer');
  if (public.reserve_ai_sprint(u,md5('d4-daily-other')::uuid)->>'ok')::boolean then raise exception 'Completed session must replace pending slot'; end if;
  update public.sessions set finished_at=midnight - interval '1 microsecond' where id=md5('d4-daily-1')::uuid;
  r := public.reserve_ai_sprint(u,md5('d4-daily-other')::uuid);
  if not (r->>'ok')::boolean then raise exception 'Completed plus pending reservation was double-counted'; end if;
  delete from public.ai_usage_reservations where user_id=u;
  update public.sessions set finished_at=now() where id=md5('d4-daily-1')::uuid;
  if public.reserve_ai_sprint(u,target) <> '{"ok":true,"alreadyFinished":true}'::jsonb then raise exception 'Completed retry must bypass cap'; end if;
  if public.reserve_ai_sprint('d4000000-0000-4000-8000-000000000072',md5('d4-daily-admin')::uuid) <> '{"ok":true,"adminExempt":true}'::jsonb then raise exception 'Admin must be exempt'; end if;
  begin
    perform public.reserve_ai_sprint(u,md5('d4-daily-admin')::uuid);
    raise exception 'Wrong owner accepted';
  exception when raise_exception then
    if sqlerrm <> 'Unknown sprint' then raise; end if;
  end;
end $$;
set local role service_role;
select public.reserve_ai_sprint('d4000000-0000-4000-8000-000000000072',md5('d4-daily-admin')::uuid);
rollback;
