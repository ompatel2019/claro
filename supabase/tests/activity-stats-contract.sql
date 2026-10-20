-- C4: disposable local Postgres only. Synthetic fixtures; every change rolls back.
-- psql -h /tmp -p 55481 -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/activity-stats-contract.sql
begin;

-- Previous definition from 0076, changing only the function's temporary name.
CREATE OR REPLACE FUNCTION pg_temp.activity_stats_before(p_filters jsonb, p_labels jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with mine as materialized (
  select s.id, s.kind, s.paper_id, s.config, s.started_at, s.finished_at, s.elapsed_s,
    (s.started_at at time zone 'Australia/Sydney')::date as day,
    coalesce(s.kind = 'flashcards' and s.config->>'mode' = 'study', false) as study,
    coalesce(a.answered, 0) as answered,
    coalesce(a.provisional, false) as provisional,
    case when s.finished_at is null then 'In progress' when a.pending then 'Marking'
      when a.provisional then 'Provisional' else 'Finished' end as status,
    case when a.pending then null else h.pct end as pct,
    coalesce(case s.kind when 'paper' then coalesce(p.title, s.config->>'title', p_labels->>'paper')
      when 'single' then p_labels->>'single'
      when 'flashcards' then p_labels->>case when s.config->>'mode' = 'test' then 'test' else 'study' end
      else coalesce(p_labels->>(s.config->>'mode'), 'Practice sprint') end, 'Practice')
      || coalesce(' · ' || names.names, '') as title,
    case when s.kind = 'flashcards' then coalesce(jsonb_array_length(s.config->'card_ids'), 0)
      else coalesce(a.items, 0) end as items
  from public.sessions s
  left join public.score_history h on h.id = s.id and h.user_id = (select auth.uid())
  left join public.papers p on p.id = s.paper_id
  left join lateral (
    select count(*) filter (where a.status <> 'skipped') as items,
      count(*) filter (where a.status <> 'skipped' and a.feedback->>'note' is distinct from 'No answer' and (a.choice_index is not null
        or nullif(btrim(a.transcript), '') is not null or nullif(btrim(a.answer_text), '') is not null
        or cardinality(a.image_paths) > 0)) as answered,
      bool_or(a.status in ('pending', 'transcribed', 'marking')) as pending,
      bool_or(a.check_status = 'in_review') as provisional
    from public.attempts a where a.session_id = s.id and a.user_id = (select auth.uid())
  ) a on true
  left join lateral (
    select string_agg(coalesce(t.name, ids.id), ', ' order by ids.ord) as names
    from jsonb_array_elements_text(case
      when jsonb_array_length(coalesce(s.config->'subtopics', '[]')) > 0 then s.config->'subtopics'
      when jsonb_array_length(coalesce(s.config->'topics', '[]')) > 0 then s.config->'topics'
      when s.config->'question'->>'topic_id' is not null then jsonb_build_array(s.config->'question'->>'topic_id')
      else '[]'::jsonb end) with ordinality ids(id, ord)
    left join public.topics t on t.id = ids.id
  ) names on true
  where s.user_id = (select auth.uid()) and s.kind in ('sprint', 'paper', 'flashcards', 'single')
), scoped as materialized (
  select m.* from mine m where
    (coalesce(p_filters->>'status', '') = ''
      or p_filters->>'status' = 'progress' and status = 'In progress'
      or p_filters->>'status' = 'marking' and status = 'Marking'
      or p_filters->>'status' = 'finished' and finished_at is not null and status <> 'Marking'
      or p_filters->>'status' = 'provisional' and provisional)
    -- A heatmap day includes sessions whose answers/cards were counted on that day.
    and (case when coalesce(p_filters->>'date', '') <> '' then
      day = (p_filters->>'date')::date
      or exists (select 1 from public.attempts a where a.session_id = m.id
        and a.user_id = (select auth.uid()) and a.feedback->>'note' is distinct from 'No answer'
        and (a.choice_index is not null or nullif(btrim(a.transcript), '') is not null
          or nullif(btrim(a.answer_text), '') is not null or cardinality(a.image_paths) > 0)
        and (a.marked_at at time zone 'Australia/Sydney')::date = (p_filters->>'date')::date)
      or exists (select 1 from public.flashcard_reviews r where r.session_id = m.id
        and r.user_id = (select auth.uid())
        group by r.flashcard_id
        having (min(r.created_at) at time zone 'Australia/Sydney')::date = (p_filters->>'date')::date)
      else (coalesce(p_filters->>'from', '') = '' or day >= (p_filters->>'from')::date)
        and (coalesce(p_filters->>'to', '') = '' or day <= (p_filters->>'to')::date) end)
    and (coalesce(p_filters->>'q', '') = '' or position(lower(p_filters->>'q') in lower(title)) > 0)
    and (coalesce(p_filters->>'topic', '') = '' or exists (
      select 1 from public.topics t where (t.id = p_filters->>'topic' or t.parent_id = p_filters->>'topic') and (
        config->'topics' ? t.id or config->'subtopics' ? t.id or config->'question'->>'topic_id' = t.id
        or exists (select 1 from public.attempts a join public.questions q on q.id = a.question_id
          where a.session_id = m.id and a.user_id = (select auth.uid()) and q.topic_id = t.id)
        or exists (select 1 from public.flashcards f where config->'card_ids' ? f.id::text and f.topic_id = t.id)))
    )
), filtered as materialized (
  select * from scoped where coalesce(p_filters->>'kind', '') = '' or kind = p_filters->>'kind'
), totals as (
  select count(*) as total, coalesce(sum(answered) filter (where kind <> 'flashcards'), 0) as questions,
    avg(pct) filter (where not study and status <> 'Marking') as average,
    max(pct) filter (where not study and status <> 'Marking') as best from filtered
), paging as (
  select greatest(1, least(coalesce((p_filters->>'page')::integer, 1), greatest(1, ceil(total / 20.0)::integer))) as page from totals
), ordered as (
  select f.*, row_number() over (order by
    case when p_filters->>'sort' = 'oldest' then started_at end asc,
    case when p_filters->>'sort' = 'highest' then case when not study then pct end end desc nulls last,
    case when p_filters->>'sort' = 'lowest' then case when not study then pct end end asc nulls last,
    started_at desc, id desc) as n from filtered f
)
select jsonb_build_object(
  'rows', coalesce((select jsonb_agg(to_jsonb(o) - 'config' - 'day' - 'n' order by n)
    from ordered o where n > (paging.page - 1) * 20 and n <= paging.page * 20), '[]'::jsonb),
  'page', paging.page, 'total', totals.total, 'all_total', (select count(*) from mine),
  'kind_total', (select count(*) from scoped),
  'kinds', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from scoped group by kind) k), '{}'::jsonb),
  'stats', jsonb_build_object('sessions', totals.total, 'questions', totals.questions, 'average', totals.average, 'best', totals.best)
) from totals cross join paging;
$function$;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000c401', '{}'),
  ('00000000-0000-4000-8000-00000000c402', '{}'),
  ('00000000-0000-4000-8000-00000000c403', '{}'),
  ('00000000-0000-4000-8000-00000000c404', '{}');
insert into public.topics (id, parent_id, name, sort) values
  ('c4-parent', null, 'Synthetic C4 parent', 98),
  ('c4-child', 'c4-parent', 'Synthetic C4 child', 99);
insert into public.questions (id, type, topic_id, marks, stem, source, year, criteria, status) values
  ('c4-live', 'short', 'c4-child', 5, 'Synthetic C4 live', 'Synthetic', 2026, '[]', 'live'),
  ('c4-retired', 'short', 'c4-child', 5, 'Synthetic C4 retired', 'Synthetic', 2026, '[]', 'retired');
insert into public.flashcards (id, topic_id, kind, front, back) values
  ('c4-card', 'c4-child', 'term', 'Synthetic C4 card', 'Synthetic');

insert into public.papers (id, title, status) values
  ('00000000-0000-4000-8000-00000000c450', 'Synthetic C4 live paper', 'live'),
  ('00000000-0000-4000-8000-00000000c451', 'Synthetic C4 retired paper', 'retired');

-- Exactly 40 supported rows plus two legacy rows: old RPC has three pages, new RPC has two.
-- Tied timestamps/scores, fractional percentages and legacy rows interleaved.
insert into public.sessions (id, user_id, kind, config, started_at, finished_at, score, max_score)
select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-00000000c401', 'sprint',
  case i % 4 when 0 then '{"mode":"short","subtopics":["c4-child","missing-id"]}'::jsonb
    when 1 then '{"mode":"mcq","topics":["c4-parent"]}'::jsonb
    when 2 then '{"mode":"mixed"}'::jsonb else '{}'::jsonb end,
  '2026-10-03T15:00:00Z'::timestamptz + (i / 2) * interval '20 minutes',
  case when i = 25 then null else '2026-10-04T01:00:00Z'::timestamptz end,
  case when i % 6 = 0 then null else (i % 3 + 1)::numeric end, 3
from generate_series(1, 36) i;
insert into public.sessions (id, user_id, kind, config, started_at, finished_at, score, max_score, paper_id) values
  ('00000000-0000-4000-8000-00000000c411', '00000000-0000-4000-8000-00000000c401', 'paper', '{"title":"Synthetic legacy"}', '2026-10-03T16:00:00Z', '2026-10-04T01:00:00Z', 99, 100, '00000000-0000-4000-8000-00000000c450'),
  ('00000000-0000-4000-8000-00000000c412', '00000000-0000-4000-8000-00000000c401', 'paper', '{}', '2026-04-04T16:00:00Z', null, null, null, '00000000-0000-4000-8000-00000000c451'),
  ('00000000-0000-4000-8000-00000000c413', '00000000-0000-4000-8000-00000000c401', 'single', '{"question":{"topic_id":"c4-child"}}', '2026-10-03T13:59:59Z', '2026-10-04T01:00:00Z', 1, 3, null),
  ('00000000-0000-4000-8000-00000000c414', '00000000-0000-4000-8000-00000000c401', 'flashcards', '{"mode":"study","card_ids":["c4-card"]}', '2026-10-03T14:00:00Z', '2026-10-04T01:00:00Z', 1, 1, null),
  ('00000000-0000-4000-8000-00000000c415', '00000000-0000-4000-8000-00000000c401', 'flashcards', '{"mode":"test","card_ids":["c4-card"]}', '2026-04-04T15:59:59Z', '2026-04-05T01:00:00Z', 1, 2, null),
  ('00000000-0000-4000-8000-00000000c416', '00000000-0000-4000-8000-00000000c401', 'sprint', '{"mode":"extended","topics":["c4-child"]}', '2026-04-04T16:00:00Z', '2026-04-05T01:00:00Z', 1, 0, null),
  ('00000000-0000-4000-8000-00000000c421', '00000000-0000-4000-8000-00000000c402', 'single', '{"question":{"topic_id":"c4-child"}}', '2026-10-03T14:00:00Z', '2026-10-04T01:00:00Z', 1, 1, null),
  ('00000000-0000-4000-8000-00000000c441', '00000000-0000-4000-8000-00000000c404', 'paper', '{}', '2026-10-03T14:00:00Z', '2026-10-04T01:00:00Z', 1, 1, '00000000-0000-4000-8000-00000000c450');
insert into public.attempts (session_id, user_id, question_id, position, answer_text, transcript, image_paths, status, check_status, feedback, marked_at)
select id, user_id, case when right(id::text, 1) = '4' then 'c4-retired' else 'c4-live' end, 1,
  case when right(id::text, 1) = '5' then null else 'Synthetic answer' end,
  case when right(id::text, 1) = '5' then 'Synthetic transcript' else null end,
  null,
  case right(id::text, 1) when '1' then 'pending' when '2' then 'marking' when '3' then 'transcribed'
    when '6' then 'skipped' when '7' then 'failed' when '8' then 'unreadable' else 'marked' end,
  case when right(id::text, 1) = '4' then 'in_review' else 'agreed' end,
  case when right(id::text, 1) = '9' then '{"note":"No answer"}'::jsonb else null end,
  '2026-10-04T13:00:00Z'
from public.sessions where user_id in ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c402') and kind <> 'flashcards';
-- NULL/blank answers, photos, and another user's row referencing the owner's session.
insert into public.attempts (session_id, user_id, question_id, position, answer_text, image_paths, status, marked_at) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000c401', 'c4-retired', 2, '  ', null, 'marked', '2026-10-05T13:00:00Z'),
  ('00000000-0000-4000-8000-00000000c413', '00000000-0000-4000-8000-00000000c401', null, 2, null, '{synthetic.png}', 'marked', '2026-10-03T14:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000c402', 'c4-retired', 2, 'Other synthetic user', null, 'marked', '2026-11-01T00:00:00Z');
insert into public.flashcard_reviews (user_id, session_id, flashcard_id, mark, source, created_at) values
  ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c414', 'c4-card', 1, 'self', '2026-10-04T13:00:00Z'),
  ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c414', 'c4-card', 0, 'self', '2026-10-05T13:00:00Z');

-- Independent translation of the OLD adapter, operating only on the old RPC JSON.
create function pg_temp.activity_adapter_before(f jsonb, labels jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare first jsonb; result jsonb; kinds jsonb; supported_total int; all_total int;
  rows jsonb := '[]'; item jsonb; scores int := 0; score_sum double precision := 0;
  best double precision; questions int := 0; page int; output_rows jsonb;
begin
  first := pg_temp.activity_stats_before(f, labels);
  select coalesce(jsonb_object_agg(key, value), '{}'), coalesce(sum(value::int), 0)
    into kinds, supported_total from jsonb_each(first->'kinds') where key in ('sprint', 'flashcards', 'single');
  select count(*) into all_total from public.sessions where user_id = auth.uid() and kind in ('sprint', 'flashcards', 'single');
  if coalesce(f->>'kind', '') <> '' or supported_total = (first->>'kind_total')::int then
    select coalesce(jsonb_agg(value order by ord), '[]') into rows
      from jsonb_array_elements(first->'rows') with ordinality x(value, ord)
      where value->>'kind' in ('sprint', 'flashcards', 'single');
    return first || jsonb_build_object('rows', rows, 'kinds', kinds, 'kind_total', supported_total, 'all_total', all_total);
  end if;
  for page in 1..greatest(1, ceil((first->>'total')::numeric / 20)::int) loop
    result := pg_temp.activity_stats_before(f || jsonb_build_object('page', page), labels);
    for item in select value from jsonb_array_elements(result->'rows') loop
      if item->>'kind' in ('sprint', 'flashcards', 'single') then
        rows := rows || jsonb_build_array(item);
        if item->>'kind' <> 'flashcards' then questions := questions + (item->>'answered')::int; end if;
        if not (item->>'study')::boolean and item->>'status' <> 'Marking' and item->>'pct' is not null then
          scores := scores + 1;
          score_sum := score_sum + (item->>'pct')::double precision;
          best := greatest(best, (item->>'pct')::double precision);
        end if;
      end if;
    end loop;
  end loop;
  page := greatest(1, least(coalesce((f->>'page')::int, 1), ceil(jsonb_array_length(rows) / 20.0)::int));
  select coalesce(jsonb_agg(value order by ord), '[]') into output_rows
    from jsonb_array_elements(rows) with ordinality x(value, ord) where ord > (page-1)*20 and ord <= page*20;
  return jsonb_build_object('rows', output_rows, 'page', page, 'total', jsonb_array_length(rows),
    'all_total', all_total, 'kind_total', supported_total, 'kinds', kinds,
    'stats', jsonb_build_object('sessions', jsonb_array_length(rows), 'questions', questions,
      'average', score_sum / nullif(scores, 0), 'best', best));
end $$;

create temporary table c4_cases (uid uuid, filters jsonb, labels jsonb, before_pages jsonb, expected jsonb, actual jsonb);
grant select, insert on c4_cases to authenticated;
set local role authenticated;
do $$
declare uid uuid; filters jsonb; extra jsonb; kind text; sort text; requested_page int; labels jsonb;
  expected jsonb; actual jsonb; first jsonb; before_pages jsonb; page int; cases int := 0;
begin
  if has_function_privilege('anon', 'public.activity_stats(jsonb,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.activity_stats(jsonb,jsonb)', 'execute')
    or exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid = 'public.activity_stats(jsonb,jsonb)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'Activity execute grants changed';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.activity_stats(jsonb,jsonb)'::regprocedure
    and not prosecdef and provolatile = 's' and proconfig = array['search_path=""']) then
    raise exception 'Activity must remain STABLE, SECURITY INVOKER with empty search_path';
  end if;
  foreach uid in array array['00000000-0000-4000-8000-00000000c401'::uuid, '00000000-0000-4000-8000-00000000c402'::uuid,
    '00000000-0000-4000-8000-00000000c403'::uuid, '00000000-0000-4000-8000-00000000c404'::uuid] loop
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
    foreach sort in array array['newest', 'oldest', 'highest', 'lowest'] loop
      foreach kind in array array['', 'sprint', 'single', 'flashcards'] loop
        foreach requested_page in array array[1, 2, 999] loop
          for extra in select value from jsonb_array_elements('[{}, {"status":"progress"}, {"status":"marking"},
            {"status":"finished"}, {"status":"provisional"}, {"q":"synthetic"}, {"q":"missing"},
            {"topic":"c4-parent"}, {"topic":"c4-child"}, {"topic":"missing"},
            {"date":"2026-10-03"}, {"date":"2026-10-04"}, {"date":"2026-10-05"}, {"date":"2026-10-06"},
            {"date":"2026-04-05"}, {"from":"2026-10-04","to":"2026-10-04"},
            {"from":"2026-04-05"}, {"to":"2026-04-05"}, {"status":"finished","topic":"c4-parent","q":"sprint"}]') loop
            filters := extra || jsonb_build_object('sort', sort, 'kind', kind, 'page', requested_page);
            labels := '{"short":"Short answer sprint","mcq":"Multiple choice sprint","mixed":"Mixed sprint",
              "extended":"Extended response sprint","study":"Flashcards · Study","test":"Flashcards · Test","single":"Mark my answer"}';
            -- Also cover caller-supplied NULL/missing labels without changing title fallbacks.
            if extra->>'q' = 'synthetic' then labels := '{"short":null,"single":"Synthetic single"}'; end if;
            expected := pg_temp.activity_adapter_before(filters, labels);
            actual := public.activity_stats(filters, labels);
            if actual is distinct from expected then
              raise exception 'Activity parity failed for user % filters %: expected %, got %', uid, filters, expected, actual;
            end if;
            if actual->'all_total' <> to_jsonb(case uid
              when '00000000-0000-4000-8000-00000000c401'::uuid then 40
              when '00000000-0000-4000-8000-00000000c402'::uuid then 1 else 0 end) then
              raise exception 'JWT ownership/count changed for %: %', uid, actual;
            end if;
            if exists (select 1 from jsonb_array_elements(actual->'rows') r where not exists (
              select 1 from public.sessions s where s.id = (r->>'id')::uuid and s.user_id = uid)) then
              raise exception 'Another user''s session leaked for %', uid;
            end if;
            if exists (select 1 from jsonb_array_elements(actual->'rows') r where r->>'kind' = 'paper')
              or actual->'kinds' ? 'paper' then raise exception 'Legacy kind leaked'; end if;
            -- Capture all old pages so the actual TypeScript adapter can independently verify the same fixtures.
            first := pg_temp.activity_stats_before(filters, labels);
            before_pages := jsonb_build_object(requested_page::text, first);
            for page in 1..greatest(1, ceil((first->>'total')::numeric / 20)::int) loop
              before_pages := before_pages || jsonb_build_object(page::text,
                pg_temp.activity_stats_before(filters || jsonb_build_object('page', page), labels));
            end loop;
            insert into c4_cases values (uid, filters, labels, before_pages, expected, actual);
            cases := cases + 1;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
  -- Fixed expectations make the fixtures' ownership and supported-kind coverage explicit.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000c401', true);
  actual := public.activity_stats('{}', '{}');
  if actual->'all_total' <> '40'::jsonb or actual->'kind_total' <> '40'::jsonb
    or actual->'kinds' <> '{"sprint":37,"single":1,"flashcards":2}'::jsonb then
    raise exception 'Supported counts or ownership changed: %', actual;
  end if;
  first := pg_temp.activity_stats_before('{"page":999}', '{}');
  actual := public.activity_stats('{"page":999}', '{}');
  if first->'total' <> '42'::jsonb or first->'page' <> '3'::jsonb
    or actual->'total' <> '40'::jsonb or actual->'page' <> '2'::jsonb
    or jsonb_array_length(actual->'rows') <> 20 then
    raise exception 'Legacy extra-page boundary changed: before %, after %', first, actual;
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  if public.activity_stats('{}', '{}') is distinct from pg_temp.activity_adapter_before('{}', '{}') then
    raise exception 'Missing JWT must preserve the empty own-row result';
  end if;
  raise notice 'C4: % exact old-RPC-plus-adapter/new-RPC JSON comparisons passed', cases;
end $$;

-- Optional local evidence consumed by the actual before-adapter TypeScript bundle.
\if :{?c4_evidence}
\pset tuples_only on
\pset format unaligned
\o :c4_evidence
select jsonb_build_object('uid', uid, 'filters', filters, 'before_pages', before_pages, 'actual', actual) from c4_cases;
\o
\endif
rollback;
