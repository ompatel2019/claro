-- Requires Om/master sign-off before production application.
-- KILL_LIST E6: remove the Papers schema (feature already removed from the app; RPCs in E1).
-- Behaviour is unchanged:
--  * sprint_questions excluded questions in LIVE papers only. Prod has one DRAFT paper
--    (23 questions, all also live bank questions that sprints already include), so the
--    exclusion set is empty; the guard below aborts if any live paper exists at apply time.
--  * question_import_review's 'paper' filter likewise reduces to: yes = none, no = all.
--  * Legacy paper sessions keep their paper_id and the paper title their owner could see
--    (papers RLS: live, listed draft preview, or admin) in legacy_paper_sessions, readable
--    exactly when the session row is readable. sessions.config is not touched, so
--    student_progress and session reads are byte-identical.
--  * New 'paper' sessions were only possible with a paper_id; a restrictive policy keeps
--    students from inserting them once the column and its check constraint go.
--  * The Papers RPCs (also dropped by 0061) are dropped here too, so this file never
--    leaves functions pointing at removed tables, whichever order the two are applied.
-- Exact names, no CASCADE. Live definitions otherwise verbatim (activity_stats includes E7).
create table if not exists public.legacy_paper_sessions (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  paper_id uuid not null,
  title text
);
alter table public.legacy_paper_sessions enable row level security;
revoke all on public.legacy_paper_sessions from public, anon, authenticated;
grant select on public.legacy_paper_sessions to authenticated;
drop policy if exists "readable with its session" on public.legacy_paper_sessions;
create policy "readable with its session" on public.legacy_paper_sessions for select
  to authenticated using (exists (select 1 from public.sessions s where s.id = session_id));

do $$
begin
  if to_regclass('public.papers') is null then return; end if;
  if exists (select 1 from public.papers where status = 'live') then
    raise exception 'A live paper exists; removing Papers would change sprint selection';
  end if;
  insert into public.legacy_paper_sessions (session_id, paper_id, title)
  select s.id, s.paper_id,
    case when p.status = 'live'
      or (p.status = 'draft' and s.user_id = any (p.preview_user_ids))
      or exists (select 1 from public.profiles pr where pr.id = s.user_id and pr.role = 'admin')
    then p.title end
  from public.sessions s
  left join public.papers p on p.id = s.paper_id
  where s.paper_id is not null
  on conflict (session_id) do nothing;
end
$$;

drop function if exists public.start_paper(uuid, boolean);
drop function if exists public.paper_rank(uuid);
drop function if exists public.admin_paper_rows();
drop function if exists public.admin_save_paper(uuid, jsonb, text, boolean, timestamptz);
drop function if exists public.admin_retire_papers(uuid[]);

CREATE OR REPLACE FUNCTION public.activity_stats(p_filters jsonb, p_labels jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with mine as materialized (
  select s.id, s.kind, lp.paper_id, s.config, s.started_at, s.finished_at, s.elapsed_s,
    (s.started_at at time zone 'Australia/Sydney')::date as day,
    coalesce(s.kind = 'flashcards' and s.config->>'mode' = 'study', false) as study,
    coalesce(a.answered, 0) as answered,
    coalesce(a.provisional, false) as provisional,
    case when s.finished_at is null then 'In progress' when a.pending then 'Marking'
      when a.provisional then 'Provisional' else 'Finished' end as status,
    case when a.pending then null else h.pct end as pct,
    coalesce(case s.kind when 'paper' then coalesce(lp.title, s.config->>'title', p_labels->>'paper')
      when 'single' then p_labels->>'single'
      when 'flashcards' then p_labels->>case when s.config->>'mode' = 'test' then 'test' else 'study' end
      else coalesce(p_labels->>(s.config->>'mode'), 'Practice sprint') end, 'Practice')
      || coalesce(' · ' || names.names, '') as title,
    case when s.kind = 'flashcards' then coalesce(jsonb_array_length(s.config->'card_ids'), 0)
      else coalesce(a.items, 0) end as items
  from public.sessions s
  left join public.legacy_paper_sessions lp on lp.session_id = s.id
  left join public.score_history h on h.id = s.id and h.user_id = (select auth.uid())
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

CREATE OR REPLACE FUNCTION public.sprint_questions(p_config jsonb)
 RETURNS TABLE(id text, type text, marks smallint, topic_id text, year smallint, verb text, origin text, source text, seen boolean, last_seen timestamp with time zone, mistake boolean, flagged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cfg as (
    select
      case p_config ->> 'mode'
        when 'mcq' then array['mcq'] when 'short' then array['short'] when 'extended' then array['extended']
        when 'mixed' then case when (p_config ->> 'include_extended')::boolean then array['mcq', 'short', 'extended']
          else array['mcq', 'short'] end
      end as types,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'topics', '[]'))) as topics,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'subtopics', '[]'))) as subtopics,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'difficulty', '[]'))) as difficulty,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'verbs', '[]'))) as verbs,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'origins', '[]'))) as origins,
      (p_config ->> 'year_from')::int as year_from,
      (p_config ->> 'year_to')::int as year_to
  ), history as (
    select distinct on (a.question_id) a.question_id, s.finished_at,
      a.mark < a.max_marks as mistake, a.flagged
    from public.attempts a
    join public.sessions s on s.id = a.session_id
    where a.user_id = (select auth.uid()) and s.finished_at is not null and a.status <> 'skipped'
      and (a.choice_index is not null or coalesce(trim(coalesce(a.transcript, a.answer_text)), '') <> '')
    order by a.question_id, s.finished_at desc
  )
  select q.id, q.type, q.marks, q.topic_id, q.year, q.verb, q.origin, q.source,
    h.question_id is not null, h.finished_at, coalesce(h.mistake, false), coalesce(h.flagged, false)
  from public.questions q
  cross join cfg
  left join history h on h.question_id = q.id
  where q.status = 'live' and q.type = any(cfg.types)
    and (cardinality(cfg.topics) = 0 or split_part(q.topic_id, '-', 1) = any(cfg.topics))
    and (cardinality(cfg.subtopics) = 0 or q.topic_id = any(cfg.subtopics)
      or not exists (select 1 from unnest(cfg.subtopics) s where split_part(s, '-', 1) = split_part(q.topic_id, '-', 1)))
    and (q.type = 'mcq' or cardinality(cfg.difficulty) = 0
      or (case when q.marks <= 3 then 'foundation' when q.marks <= 5 then 'standard' else 'challenging' end) = any(cfg.difficulty))
    and (q.type = 'mcq' or cardinality(cfg.verbs) = 0 or q.verb = any(cfg.verbs))
    and (cardinality(cfg.origins) = 0 or q.origin = any(cfg.origins))
    and (cfg.year_from is null or q.year >= cfg.year_from)
    and (cfg.year_to is null or q.year <= cfg.year_to)
$function$;

CREATE OR REPLACE FUNCTION public.question_import_review(p_threshold double precision DEFAULT 0.82, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id text, draft jsonb, "row" jsonb, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_threshold is null or p_threshold < 0.60 or p_threshold > 0.99 then
    raise exception 'invalid threshold';
  end if;
  perform set_config('pg_trgm.similarity_threshold', p_threshold::text, true);
  return query
    select d.id,
      jsonb_build_object('id', d.id, 'stem', d.stem, 'source', d.source, 'status', d.status),
      jsonb_build_object('id', m.id, 'stem', m.stem, 'source', m.source, 'status', m.status),
      m.score::double precision
    from public.questions d
    cross join lateral (
      select c.* from (
        select q.*, extensions.similarity(d.stem, q.stem) as score
        from public.questions q where q.id = d.duplicate_of and q.id <> d.id
        union all
        -- % uses the questions_stem_trgm GIN index (threshold set above) instead of scoring every row
        select q.*, extensions.similarity(d.stem, q.stem) as score
        from public.questions q where d.duplicate_of is null and q.id <> d.id and q.status <> 'retired'
          and q.stem operator(extensions.%) d.stem
      ) c where c.id = d.duplicate_of or c.score >= p_threshold
      order by c.score desc, c.id limit 1
    ) m where d.status = 'draft'
      and (coalesce(p_filters->>'q', '') = '' or strpos(lower(concat_ws(' ', d.id, d.source, d.stem, m.id, m.source, m.stem)), lower(p_filters->>'q')) > 0)
      and (coalesce(p_filters->>'type', '') = '' or d.type = p_filters->>'type')
      and (coalesce(p_filters->>'topic', '') = '' or d.topic_id = p_filters->>'topic' or exists (
        select 1 from public.topics t where t.id = d.topic_id and t.parent_id = p_filters->>'topic'))
      and (coalesce(p_filters->>'from', '') !~ '^[0-9]{4}$' or d.year >= case when p_filters->>'from' ~ '^[0-9]{4}$' then (p_filters->>'from')::int end)
      and (coalesce(p_filters->>'to', '') !~ '^[0-9]{4}$' or d.year <= case when p_filters->>'to' ~ '^[0-9]{4}$' then (p_filters->>'to')::int end)
      and (coalesce(p_filters->>'origin', '') = '' or d.origin = p_filters->>'origin')
      and (coalesce(p_filters->>'verb', '') = '' or d.verb = p_filters->>'verb')
      and (coalesce(p_filters->>'marks', '') !~ '^[0-9]{1,2}$' or d.marks = case when p_filters->>'marks' ~ '^[0-9]{1,2}$' then (p_filters->>'marks')::int end)
      -- No question is in a live paper (Papers removed): 'yes' matches nothing, 'no' everything.
      and (coalesce(p_filters->>'paper', '') not in ('yes','no') or p_filters->>'paper' = 'no')
      and case p_filters->>'missing'
        when 'explanation' then d.type='mcq' and nullif(btrim(d.explanation), '') is null
        when 'sample' then d.type <> 'mcq' and nullif(btrim(d.sample_answer), '') is null
        when 'criteria' then d.type <> 'mcq' and (d.criteria is null or d.criteria='[]'::jsonb)
        when 'stimulus' then nullif(btrim(d.stimulus), '') is not null
        else true end;
end;
$function$;

create or replace view public.score_history with (security_invoker = true) as
select s.user_id, s.id, s.kind, s.config->>'mode' as mode, lp.paper_id,
  s.finished_at, s.score, s.max_score,
  round(100::numeric * s.score / nullif(s.max_score, 0::numeric), 1) as pct
from public.sessions s
left join public.legacy_paper_sessions lp on lp.session_id = s.id
where s.finished_at is not null;

drop policy if exists "no direct paper sessions" on public.sessions;
create policy "no direct paper sessions" on public.sessions as restrictive for insert
  to authenticated with check (kind <> 'paper');

alter table public.sessions drop constraint if exists sessions_paper_check;
drop index if exists public.sessions_paper_id_user_id_idx;
alter table public.sessions drop column if exists paper_id;
drop table if exists public.paper_questions;
drop table if exists public.papers;
