begin;
insert into public.topics(id,parent_id,name,sort) values ('t1-lane2-split-check','t1','Synthetic split check',99);
insert into public.questions(id,type,topic_id,marks,stem,options,correct_index,criteria,source,year,origin,status)
select 'lane2-split-mc-'||i,'mcq','t1-lane2-split-check',1,'Synthetic MC question '||i,
 array['Synthetic A','Synthetic B','Synthetic C','Synthetic D'],0,null,'Synthetic Q'||i,2026,'claro','live' from generate_series(1,12) i;
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
select 'lane2-split-short-'||m,'short','t1-lane2-split-check',m,'Synthetic short question '||m,
 '[]'::jsonb,'Synthetic Q'||m,2026,'claro','live' from unnest(array[8,5,4]) m;
insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
values('lane2-split-essay','extended','t1-lane2-split-check',20,'Synthetic essay','[]','Synthetic essay',2026,'claro','live');
do $$
declare s uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('claro.test_student_id'),true);
 insert into public.sessions(user_id,kind,config,finished_at,score,max_score)
 values ((select auth.uid()),'sprint','{"mode":"short","topics":["t1"]}',now(),9,9) returning id into s;
 insert into public.attempts(user_id,session_id,question_id,position,status,answer_text,mark,max_marks)
 select (select auth.uid()),s,'lane2-split-short-'||m,row_number() over(),'marked','Synthetic history answer',m,m
 from unnest(array[5,4]) m;
end $$;
set local role authenticated;
do $$
declare s uuid; cfg jsonb; mc int; shorts int; types text[];
begin
 s := public.start_sprint('{"mode":"mixed","size_by":"marks","target":20,"mcq_count":11,"short_marks":9,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"order":"shuffled","include_extended":true,"timed":false}');
 select config into cfg from public.sessions where id=s;
 select count(*) filter(where q.type='mcq'),coalesce(sum(q.marks) filter(where q.type='short'),0),array_agg(q.type order by a.position)
 into mc,shorts,types from public.attempts a join public.questions q on q.id=a.question_id where a.session_id=s;
 if mc<>11 or shorts<>9 or cfg->>'order'<>'exam' or 'extended'=any(types) or types[1]<>'mcq' or types[13]<>'short' then
  raise exception 'Exact split or exam order failed';
 end if;
 -- All MC bucket, insufficient MC pool: no written substitution.
 s := public.start_sprint('{"mode":"mixed","target":20,"mcq_count":20,"short_marks":0,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"timed":false}');
 select config into cfg from public.sessions where id=s;
 if (cfg->>'actual_mcq_count')::int<>12 or (cfg->>'actual_short_marks')::int<>0 then raise exception 'MC shortfall spilled: % / %', cfg->>'actual_mcq_count', cfg->>'actual_short_marks'; end if;
 -- All written bucket: maximum attainable total, never an MC substitution.
 s := public.start_sprint('{"mode":"mixed","target":20,"mcq_count":0,"short_marks":20,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"timed":false}');
 select config into cfg from public.sessions where id=s;
 if (cfg->>'actual_mcq_count')::int<>0 or (cfg->>'actual_short_marks')::int<>17 then raise exception 'Short shortfall spilled'; end if;
 -- Whole shorts follow the spec's +/-2 tolerance when exact fill is impossible.
 s := public.start_sprint('{"mode":"mixed","target":20,"mcq_count":13,"short_marks":7,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"timed":false}');
 select config into cfg from public.sessions where id=s;
 if (cfg->>'actual_mcq_count')::int<>12 or (cfg->>'actual_short_marks')::int<>8 then raise exception 'Nearest short total failed'; end if;
 -- 0050: a five-mark Mixed total is accepted (was 20 minimum); below 5 is still rejected.
 s := public.start_sprint('{"mode":"mixed","target":5,"mcq_count":5,"short_marks":0,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"timed":false}');
 select config into cfg from public.sessions where id=s;
 if (cfg->>'target')::int<>5 or (cfg->>'actual_mcq_count')::int<>5 or (cfg->>'actual_short_marks')::int<>0 then raise exception 'Five-mark mixed failed'; end if;
 s := public.start_sprint('{"mode":"mixed","target":5,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"timed":false}');
 select config into cfg from public.sessions where id=s;
 if (cfg->>'mcq_count')::int<>3 or (cfg->>'short_marks')::int<>2 then raise exception 'Default five-mark split should be 3/2'; end if;
 begin
  perform public.start_sprint('{"mode":"mixed","target":4,"topics":["t1"],"subtopics":["t1-lane2-split-check"]}');
  raise exception 'Four-mark mixed accepted';
 exception when others then if sqlerrm not like 'size is out of range%' then raise; end if; end;
 -- Other modes omit unused bucket fields so Same setup again stays valid.
 s := public.start_sprint('{"mode":"mcq","target":5,"topics":["t1"],"subtopics":["t1-lane2-split-check"],"timed":false}');
 select config into cfg from public.sessions where id=s;
 if cfg ? 'mcq_count' or cfg ? 'short_marks' then raise exception 'Unused buckets in MC config'; end if;
 -- Empty history and invalid splits produce useful server errors.
 begin
  perform public.start_sprint('{"mode":"mixed","target":20,"mcq_count":11,"short_marks":11}');
  raise exception 'Invalid split accepted';
 exception when others then if sqlerrm not like 'invalid mixed counts%' then raise; end if; end;
 begin
  perform public.start_sprint('{"mode":"mixed","target":20,"history":"flagged","topics":["t1"],"subtopics":["t1-lane2-split-check"]}');
  raise exception 'Empty pool accepted';
 exception when others then if sqlerrm not like 'no questions match%' then raise; end if; end;
end $$;
rollback;
