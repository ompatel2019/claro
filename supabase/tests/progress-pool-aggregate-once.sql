-- Disposable local Postgres only; psql -v ON_ERROR_STOP=1 -f this-file.sql.
-- Restore the previous definitions inside the transaction, clone them as invokers,
-- then reapply 0081. Full JSONB equality preserves array order and NULLs.
\set ON_ERROR_STOP on
begin;
\ir ../migrations/0051_progress_null_type.sql
create or replace function public.sprint_pool(p_config jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pool as (select * from public.sprint_questions(p_config)),
  hist as (
    select * from pool where case coalesce(p_config ->> 'history', 'prefer_new')
      when 'new_only' then not seen when 'mistakes' then mistake when 'flagged' then flagged else true end
  )
  select jsonb_build_object(
    'questions', (select count(*) from hist),
    'marks', (select coalesce(sum(marks), 0) from hist),
    'mcq_questions', (select count(*) from hist where type = 'mcq'),
    'mcq_new', (select count(*) from pool where type = 'mcq' and not seen),
    'short_marks', (select coalesce(sum(marks), 0) from hist where type = 'short'),
    'by_type', (select coalesce(jsonb_object_agg(type, n), '{}') from (select type, count(*) n from hist group by type) t),
    'any', (select count(*) from pool),
    'new', (select count(*) from pool where not seen),
    'mistakes', (select count(*) from pool where mistake),
    'flagged', (select count(*) from pool where flagged),
    'topics', (select coalesce(jsonb_object_agg(t, n), '{}') from (select split_part(topic_id, '-', 1) t, count(*) n
      from public.sprint_questions(p_config - 'topics' - 'subtopics') group by 1) x),
    'subtopics', (select coalesce(jsonb_object_agg(topic_id, n), '{}') from (select topic_id, count(*) n
      from public.sprint_questions(p_config - 'subtopics') group by 1) x),
    'all_subtopics', (select count(*) from public.sprint_questions(p_config - 'subtopics')),
    'verbs', (select coalesce(jsonb_object_agg(verb, n), '{}') from (select verb, count(*) n
      from public.sprint_questions(p_config - 'verbs') where verb is not null group by 1) x),
    'difficulty', (select coalesce(jsonb_object_agg(d, n), '{}') from (select
      case when marks <= 3 then 'foundation' when marks <= 5 then 'standard' else 'challenging' end d, count(*) n
      from public.sprint_questions(p_config - 'difficulty') where type <> 'mcq' group by 1) x),
    'all_years', (select count(*) from public.sprint_questions(p_config - 'year_from' - 'year_to')),
    'years', (select jsonb_build_array(min(q.year), max(q.year)) from public.questions q where q.status = 'live'),
    'trial', exists (select 1 from public.questions q where q.status = 'live' and q.origin = 'a1')
  );
$$;

create temp table e10_function_attributes as
select oid, to_jsonb(p) - 'prosrc' as attributes from pg_proc p
where oid in ('public.student_progress(date,date)'::regprocedure, 'public.sprint_pool(jsonb)'::regprocedure);
do $$
begin
  execute replace(pg_get_functiondef('public.student_progress(date,date)'::regprocedure),
    'public.student_progress(', 'pg_temp.student_progress_before(');
  execute replace(pg_get_functiondef('public.sprint_pool(jsonb)'::regprocedure),
    'public.sprint_pool(', 'pg_temp.sprint_pool_before(');
end $$;
revoke execute on function pg_temp.student_progress_before(date,date), pg_temp.sprint_pool_before(jsonb) from public, anon;
grant execute on function pg_temp.student_progress_before(date,date), pg_temp.sprint_pool_before(jsonb) to authenticated;
\ir ../migrations/0081_progress_pool_aggregate_once.sql
do $$
begin
  if exists (select 1 from e10_function_attributes old join pg_proc p using (oid)
    where old.attributes is distinct from to_jsonb(p) - 'prosrc') then
    raise exception 'Function attributes, defaults, ownership or ACL changed';
  end if;
  if has_function_privilege('anon', 'public.student_progress(date,date)', 'execute')
    or has_function_privilege('anon', 'public.sprint_pool(jsonb)', 'execute') then
    raise exception 'Anonymous EXECUTE must stay revoked';
  end if;
end $$;

insert into auth.users (id, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001', '{}'),
  ('e1000000-0000-4000-8000-000000000002', '{}'),
  ('e1000000-0000-4000-8000-000000000003', '{}'),
  ('e1000000-0000-4000-8000-000000000004', '{}');
update public.profiles set role = 'admin' where id = 'e1000000-0000-4000-8000-000000000004';
insert into public.topics (id, parent_id, name, sort) values
  ('e10', null, 'Synthetic E10', 99),
  ('e10-a', 'e10', 'Synthetic E10 A', 99),
  ('e10-b', 'e10', 'Synthetic E10 B', 99),
  ('e11', null, 'Synthetic second topic', 99),
  ('e11-a', 'e11', 'Synthetic second child', 99);
insert into public.questions (id, type, topic_id, marks, stem, source, year, origin, verb, status,
  options, correct_index, criteria)
select 'e10-' || id, type, topic, marks, 'Synthetic E10 ' || id, 'Synthetic E10 Q' || n,
  2020 + n % 7, origin, verb, status,
  case when type = 'mcq' then array['A','B','C','D'] end,
  case when type = 'mcq' then 0 end, case when type <> 'mcq' then '[]'::jsonb end
from (values
  (1, 'mcq', 'mcq', 'e10-a', 1, 'nesa', null, 'live'),
  (2, 'short3', 'short', 'e10-a', 3, 'a1', 'Explain', 'live'),
  (3, 'short5', 'short', 'e10-b', 5, 'claro', '', 'live'),
  (4, 'short8', 'short', 'e11-a', 8, 'nesa', 'Analyse', 'live'),
  (5, 'extended', 'extended', 'e11-a', 20, 'a1', 'Evaluate', 'live'),
  (6, 'retired', 'short', 'e10-a', 3, 'claro', null, 'retired'),
  (7, 'draft', 'mcq', 'e10-a', 1, 'claro', null, 'draft'),
  (8, 'failed', 'short', 'e10-b', 4, 'nesa', 'Explain', 'live'),
  (9, 'skipped', 'mcq', 'e10-b', 1, 'a1', null, 'live'),
  (10, 'nullmark', 'short', 'e10-b', 6, 'nesa', 'Explain', 'live')
) q(n, id, type, topic, marks, origin, verb, status);

-- Midnight, the spring gap, both occurrences of the autumn repeated hour,
-- tied finishes, own questions, no attempts, only hidden questions and an open session.
insert into public.sessions (id, user_id, kind, config, started_at, finished_at, elapsed_s, score, max_score)
select ('e1010000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'e1000000-0000-4000-8000-000000000001', kind, config, '2026-01-01T00:00:00Z', finished::timestamptz, n * 30,
  case when n = 11 then null else 1.25 end, case when n = 11 then 0 else 3 end
from (values
  (1, 'sprint', '{"mode":"mixed"}'::jsonb, '2026-10-03T14:00:00Z'),
  (2, 'sprint', '{"mode":"mixed"}', '2026-10-03T13:59:59Z'),
  (3, 'sprint', '{"mode":"mixed"}', '2026-10-03T15:59:59Z'),
  (4, 'sprint', '{"mode":"mixed"}', '2026-10-03T16:00:00Z'),
  (5, 'sprint', '{"mode":"mixed"}', '2026-10-04T12:59:59Z'),
  (6, 'sprint', '{"mode":"mixed"}', '2026-10-04T13:00:00Z'),
  (7, 'sprint', '{"mode":"mixed"}', '2026-04-04T15:30:00Z'),
  (8, 'sprint', '{"mode":"mixed"}', '2026-04-04T16:30:00Z'),
  (9, 'single', '{"question":{"topic_id":"e10-a","marks":5,"verb":"Explain"}}', '2026-10-03T16:00:00Z'),
  (10, 'single', '{"question":{"topic_id":"e10-b","marks":12,"verb":""}}', '2026-10-03T16:00:00Z'),
  (11, 'sprint', '{}', '2026-10-03T16:00:00Z'),
  (12, 'sprint', '{}', '2026-10-03T16:00:00Z'),
  (13, 'sprint', '{}', null),
  (14, 'flashcards', '{"mode":"test"}', '2026-10-03T16:00:00Z'),
  (15, 'single', '{"question":{"topic_id":"e10-a"}}', '2026-10-03T16:00:00Z')
) s(n, kind, config, finished);
insert into public.sessions (id, user_id, kind, config, finished_at, score, max_score) values
  ('e1020000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002',
   'sprint', '{"mode":"mcq"}', '2026-10-03T16:00:00Z', 1, 1),
  ('e1020000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000004',
   'sprint', '{"mode":"mixed"}', '2026-10-03T16:00:00Z', 1, 3);

insert into public.attempts (session_id, user_id, question_id, position, status, choice_index,
  answer_text, transcript, image_paths, feedback, mark, max_marks, marked_at, flagged)
select s.id, s.user_id, q.id, q.n,
  case q.n when 8 then 'failed' when 9 then 'skipped' else 'marked' end,
  case when q.n = 1 then 0 end,
  case when q.n in (2, 5, 8) then 'Synthetic answer' when q.n = 3 then '  ' end,
  case when q.n = 3 then 'Synthetic transcript' end,
  case when q.n = 4 then array['synthetic.png'] end,
  case when q.n = 5 then '{"note":"No answer"}'::jsonb end,
  case q.n when 1 then 0.333 when 2 then 1.25 when 10 then null else 2 end,
  case when q.n = 4 then 0 else q.marks end,
  case q.n when 1 then '2026-10-01T00:00:00Z'::timestamptz when 2 then '2026-10-10T00:00:00Z'::timestamptz
    when 3 then null else s.finished_at end, q.n in (1, 2)
from public.sessions s cross join (
  select q.*,
    case id when 'e10-mcq' then 1 when 'e10-short3' then 2 when 'e10-short5' then 3
      when 'e10-short8' then 4 when 'e10-extended' then 5 when 'e10-retired' then 6
      when 'e10-draft' then 7 when 'e10-failed' then 8 when 'e10-skipped' then 9 else 10 end as n
  from public.questions q where id like 'e10-%'
) q where s.id between 'e1010000-0000-4000-8000-000000000001' and 'e1010000-0000-4000-8000-000000000008';
insert into public.attempts (session_id, user_id, position, answer_text, status, mark, max_marks, marked_at)
select id, user_id, 1, 'Synthetic own answer', 'marked', 1.25, 3, '2026-10-10T00:00:00Z'
from public.sessions where id in ('e1010000-0000-4000-8000-000000000009',
  'e1010000-0000-4000-8000-000000000010', 'e1010000-0000-4000-8000-000000000015');
insert into public.attempts (session_id, user_id, question_id, position, status, choice_index, mark, max_marks, marked_at)
select id, user_id, case when id = 'e1010000-0000-4000-8000-000000000012' then 'e10-retired' else 'e10-mcq' end,
  1, 'marked', 0, 1, 1, '2026-10-03T16:00:00Z'
from public.sessions where id in ('e1010000-0000-4000-8000-000000000012',
  'e1010000-0000-4000-8000-000000000013', 'e1020000-0000-4000-8000-000000000001');
-- An administrator's own retired-question history still has a visible type.
insert into public.attempts (session_id, user_id, question_id, position, status, answer_text, mark, max_marks)
values ('e1020000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000004',
  'e10-retired', 1, 'marked', 'Synthetic admin answer', 1, 3);
-- A foreign user's row in an otherwise visible session must still be excluded.
insert into public.attempts (session_id, user_id, question_id, position, status, answer_text, mark, max_marks)
values ('e1010000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000002',
  'e10-short3', 1, 'marked', 'Other synthetic user', 3, 3);

-- Unchanged card branches are included in the full-report comparison.
insert into public.flashcards (id, topic_id, kind, front, back, created_at, owner_id, origin) values
  ('e10-card-new', 'e10-a', 'term', 'Synthetic E10 new', 'Synthetic back', '2026-10-03T16:00:00Z', null, 'claro'),
  ('e10-card-known', 'e10-a', 'term', 'Synthetic E10 known', 'Synthetic back', '2026-01-01T00:00:00Z', null, 'claro'),
  ('e10-card-own', 'e10-b', 'stat', 'Synthetic E10 own', 'Synthetic back', '2026-01-01T00:00:00Z', 'e1000000-0000-4000-8000-000000000001', 'student'),
  ('e10-card-other', 'e10-b', 'stat', 'Synthetic E10 other', 'Synthetic back', '2026-01-01T00:00:00Z', 'e1000000-0000-4000-8000-000000000002', 'student');
insert into public.flashcard_progress (user_id, flashcard_id, due_on, interval_days, last_mark, updated_at) values
  ('e1000000-0000-4000-8000-000000000001', 'e10-card-known', '2026-10-04', 1, 1, '2026-10-03T16:00:00Z'),
  ('e1000000-0000-4000-8000-000000000001', 'e10-card-own', '2026-10-05', 1, 0.5, '2026-10-03T16:00:00Z');

-- Owner context also sees retired/draft questions, but keeps explicit UID filters.
do $$
begin
  perform set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
  if public.student_progress('2026-10-04', '2026-10-04') is distinct from
      pg_temp.student_progress_before('2026-10-04', '2026-10-04')
    or public.sprint_pool('{"mode":"mixed"}') is distinct from pg_temp.sprint_pool_before('{"mode":"mixed"}') then
    raise exception 'Owner-context JSON changed';
  end if;
end $$;
set local role authenticated;
do $$
declare
  u text; zone text; r record; cfg jsonb; mode_cfg jsonb; facet jsonb; hist text;
  old_report jsonb; new_report jsonb; comparisons int := 0;
begin
  foreach zone in array array['UTC', 'Australia/Sydney', 'America/New_York'] loop
    perform set_config('TimeZone', zone, true);
    foreach u in array array['e1000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003',
      'e1000000-0000-4000-8000-000000000004', ''] loop
      -- User B uses the JSON claims fallback; include no-sub authenticated callers.
      perform set_config('request.jwt.claim.sub', case when u like '%002' then '' else u end, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', nullif(u, ''), 'role', 'authenticated')::text, true);
      if auth.uid() is distinct from nullif(u, '')::uuid then raise exception 'Wrong test JWT'; end if;
      for r in select * from (values
        (null::date, '2026-10-04'::date), ('2026-10-04'::date, '2026-10-04'::date),
        ('2026-10-03'::date, '2026-10-05'::date), ('2026-04-05'::date, '2026-04-05'::date),
        ('2026-10-10'::date, '2026-10-10'::date), ('2027-01-01'::date, '2027-01-02'::date),
        ('2026-10-05'::date, '2026-10-04'::date), (null::date, null::date)
      ) dates(lo, hi) loop
        old_report := pg_temp.student_progress_before(r.lo, r.hi);
        new_report := public.student_progress(r.lo, r.hi);
        if old_report is distinct from new_report then
          raise exception 'Progress mismatch for %, %, %..%: old %, new %', u, zone, r.lo, r.hi, old_report, new_report;
        end if;
        comparisons := comparisons + 1;
      end loop;
      if public.student_progress() is distinct from pg_temp.student_progress_before() then
        raise exception 'Default progress arguments changed';
      end if;
      for mode_cfg in select x from jsonb_array_elements('[{}, {"mode":"mcq"}, {"mode":"short"},
        {"mode":"extended"}, {"mode":"mixed"}, {"mode":"mixed","include_extended":true}]') x loop
        foreach hist in array array['prefer_new', 'new_only', 'mistakes', 'flagged', 'any'] loop
          for facet in select x from jsonb_array_elements('[{}, {"topics":["e10"],"subtopics":["e10-a"]},
            {"topics":["e10","e11"],"subtopics":["e10-b"]},
            {"difficulty":["standard"],"verbs":["Explain"],"origins":["a1"],"year_from":2021,"year_to":2025},
            {"topics":["absent"],"subtopics":[],"year_from":2030}]') x loop
            cfg := mode_cfg || facet || jsonb_build_object('history', hist);
            old_report := pg_temp.sprint_pool_before(cfg);
            new_report := public.sprint_pool(cfg);
            if old_report is distinct from new_report then
              raise exception 'Pool mismatch for %, %, %: old %, new %', u, zone, cfg, old_report, new_report;
            end if;
            comparisons := comparisons + 1;
          end loop;
        end loop;
      end loop;
      if public.sprint_pool(null) is distinct from pg_temp.sprint_pool_before(null)
        or public.sprint_pool('{"mode":"mixed"}') is distinct from pg_temp.sprint_pool_before('{"mode":"mixed"}') then
        raise exception 'NULL/default pool config changed';
      end if;
    end loop;
  end loop;
  raise notice 'E10: % exact full-JSON comparisons passed, plus default/NULL calls', comparisons;
end $$;

-- Anchor the edge fixtures so an accidentally empty test cannot pass on parity alone.
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
do $$
declare report jsonb; row jsonb;
begin
  report := public.student_progress('2026-10-04', '2026-10-04');
  if jsonb_array_length(report -> 'history') <> 10 then raise exception 'Sydney spring bounds changed: %', report -> 'history'; end if;
  select h into row from jsonb_array_elements(report -> 'history') h where h ->> 'id' = 'e1010000-0000-4000-8000-000000000001';
  if (row -> 'by_type' ->> 'mcq')::numeric is distinct from 33.3
    or (row -> 'by_type' ->> 'short')::numeric is distinct from 40.625 then
    raise exception 'Fractional percentages or cross-marking-date history changed: %', row;
  end if;
  select h into row from jsonb_array_elements(report -> 'history') h where h ->> 'id' = 'e1010000-0000-4000-8000-000000000012';
  if row -> 'by_type' is distinct from '{}'::jsonb then raise exception 'Hidden type must be omitted: %', row; end if;
  select h into row from jsonb_array_elements(report -> 'history') h where h ->> 'id' = 'e1010000-0000-4000-8000-000000000011';
  if row -> 'by_type' is distinct from '{}'::jsonb or row ->> 'pct' is not null then raise exception 'Empty/foreign attempts or NULL score changed: %', row; end if;
  report := public.student_progress('2026-04-05', '2026-04-05');
  if jsonb_array_length(report -> 'history') <> 2 then raise exception 'Sydney autumn bounds changed'; end if;
  report := public.sprint_pool('{"mode":"mixed","topics":["e10"],"subtopics":["e10-a"]}');
  if (report ->> 'all_subtopics')::int <= (report ->> 'any')::int then raise exception 'Subtopic facet must ignore itself: %', report; end if;
end $$;
rollback;
