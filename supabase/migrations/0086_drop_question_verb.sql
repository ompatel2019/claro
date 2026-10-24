-- DRAFT (it#5): drop public.questions.verb (Directive verb).
-- Do NOT apply until claro-dev's Wave 2 (removes every read/write of verb) is merged and live.
-- Master applies this to prod; nobody applies it from a branch.
--
-- Scope, deliberately narrow:
--   * Difficulty has no column: it is derived from questions.marks in sprint_questions/sprint_pool.
--     Nothing to drop; the derived 'difficulty' filter/count is left in place (harmless when unused).
--   * The setup "Source" filter is questions.origin (nesa/a1/claro), NOT questions.source.
--     questions.source is the paper source pill ("2013 Practice", "HSC") and is sent to the marking
--     prompt ("Source: ..."); origin drives the A1 trial flag, imports, admin bank and own questions.
--     Neither column is dropped here.
--
-- Dependents rewritten first (exact names/signatures, no CASCADE):
--   sprint_questions(jsonb): same signature (the attempts RLS policy "live eligible question insert"
--     names its output columns, incl. verb), verb returned as null, verbs filter removed.
--   sprint_pool(jsonb): 'verbs' count removed.
--   student_progress(date, date): verb breakdown keeps single-check config verbs only.
--   admin_save_question(jsonb, timestamptz): stops writing verb.
--   question_import_review(double precision, jsonb): verb filter removed.
-- Column-level grants on verb (authenticated SELECT) go with the column. No index, view,
-- constraint, trigger or generated column references verb.

CREATE OR REPLACE FUNCTION public.sprint_questions(p_config jsonb) RETURNS TABLE(id text, type text, marks smallint, topic_id text, year smallint, verb text, origin text, source text, seen boolean, last_seen timestamp with time zone, mistake boolean, flagged boolean)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if p_config ? 'marks_per_short' and p_config -> 'marks_per_short' <> 'null'::jsonb then
    if jsonb_typeof(p_config -> 'marks_per_short') <> 'number' then
      raise exception 'invalid marks_per_short';
    end if;
    if (p_config ->> 'marks_per_short')::numeric <> trunc((p_config ->> 'marks_per_short')::numeric)
      or (p_config ->> 'marks_per_short')::numeric not between 1 and 100 then
      raise exception 'invalid marks_per_short';
    end if;
  end if;
  if p_config ? 'short_count' then
    if jsonb_typeof(p_config -> 'short_count') <> 'number' then
      raise exception 'invalid short_count';
    end if;
    if (p_config ->> 'short_count')::numeric <> trunc((p_config ->> 'short_count')::numeric)
      or (p_config ->> 'short_count')::numeric not between 0 and 15 then
      raise exception 'invalid short_count';
    end if;
  end if;
  return query
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
      array(select jsonb_array_elements_text(coalesce(p_config -> 'origins', '[]'))) as origins,
      (p_config ->> 'marks_per_short')::numeric::int as marks_per_short
  ), history as (
    select distinct on (a.question_id) a.question_id, s.finished_at,
      a.mark < a.max_marks as mistake, a.flagged
    from public.attempts a
    join public.sessions s on s.id = a.session_id
    where a.user_id = (select auth.uid()) and s.finished_at is not null and a.status <> 'skipped'
      and (a.choice_index is not null or coalesce(trim(coalesce(a.transcript, a.answer_text)), '') <> '')
    order by a.question_id, s.finished_at desc
  )
  select q.id, q.type, q.marks, q.topic_id, q.year, null::text, q.origin, q.source,
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
    and (cardinality(cfg.origins) = 0 or q.origin = any(cfg.origins))
    and (q.type <> 'short' or cfg.marks_per_short is null or q.marks = cfg.marks_per_short);
end;
$$;

CREATE OR REPLACE FUNCTION public.sprint_pool(p_config jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with pool as (select * from public.sprint_questions(p_config)),
  subtopic_pool as materialized (select topic_id from public.sprint_questions(p_config - 'subtopics')),
  hist as (
    select * from pool where case coalesce(p_config ->> 'history', 'prefer_new')
      when 'new_only' then not seen when 'mistakes' then mistake when 'flagged' then flagged else true end
  )
  select jsonb_build_object(
    'questions', (select count(*) from hist),
    'marks', (select coalesce(sum(marks), 0) from hist),
    'mcq_questions', (select count(*) from hist where type = 'mcq'),
    'mcq_new', (select count(*) from pool where type = 'mcq' and not seen),
    'short_questions', (select count(*) from hist where type = 'short'),
    'short_mark_values', (select coalesce(jsonb_object_agg(marks, n), '{}') from (select marks, count(*) n
      from public.sprint_questions(p_config - 'marks_per_short') where type = 'short' group by marks) x),
    'short_marks', (select coalesce(sum(marks), 0) from hist where type = 'short'),
    'by_type', (select coalesce(jsonb_object_agg(type, n), '{}') from (select type, count(*) n from hist group by type) t),
    'any', (select count(*) from pool),
    'new', (select count(*) from pool where not seen),
    'mistakes', (select count(*) from pool where mistake),
    'flagged', (select count(*) from pool where flagged),
    'topics', (select coalesce(jsonb_object_agg(t, n), '{}') from (select split_part(topic_id, '-', 1) t, count(*) n
      from public.sprint_questions(p_config - 'topics' - 'subtopics') group by 1) x),
    'subtopics', (select coalesce(jsonb_object_agg(topic_id, n), '{}') from (select topic_id, count(*) n
      from subtopic_pool group by 1) x),
    'all_subtopics', (select count(*) from subtopic_pool),
    'difficulty', (select coalesce(jsonb_object_agg(d, n), '{}') from (select
      case when marks <= 3 then 'foundation' when marks <= 5 then 'standard' else 'challenging' end d, count(*) n
      from public.sprint_questions(p_config - 'difficulty') where type <> 'mcq' group by 1) x),
    'trial', exists (select 1 from public.questions q where q.status = 'live' and q.origin = 'a1')
  );
$$;

CREATE OR REPLACE FUNCTION public.student_progress(p_from date DEFAULT NULL::date, p_to date DEFAULT ((now() AT TIME ZONE 'Australia/Sydney'::text))::date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
with bounds as (
  select (select auth.uid()) as uid,
    p_from::timestamp at time zone 'Australia/Sydney' as lo,
    (p_to + 1)::timestamp at time zone 'Australia/Sydney' as hi
), marked as materialized (
  select a.id, a.session_id,
    coalesce(q.topic_id, s.config -> 'question' ->> 'topic_id') as topic_id,
    coalesce(q.type, case when s.kind = 'single' then
      case when (s.config -> 'question' ->> 'marks')::int > 8 then 'extended' else 'short' end end) as type,
    nullif(s.config -> 'question' ->> 'verb', '') as verb,
    a.mark, a.max_marks,
    a.marked_at,
    (a.feedback ->> 'note' is distinct from 'No answer' and
      (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> '' or
       btrim(coalesce(a.transcript, '')) <> '' or cardinality(a.image_paths) > 0)) as answered
  from public.attempts a left join public.questions q on q.id = a.question_id
  join public.sessions s on s.id = a.session_id
  cross join bounds b
  where a.user_id = b.uid and a.status = 'marked' and a.mark is not null
    and a.max_marks > 0 and a.marked_at < b.hi
    and (b.lo is null or a.marked_at >= b.lo)
), topic_marks as (
  -- Aggregate by topic and session before rolling up parent topics.
  select m.topic_id, t.parent_id, m.session_id,
    count(*) filter (where m.answered) as answered,
    sum(m.mark) as earned, sum(m.max_marks) as possible,
    max(m.marked_at) filter (where m.answered) as last_answered
  from marked m join public.topics t on t.id = m.topic_id
  group by m.topic_id, t.parent_id, m.session_id
), topic_rows as (
  select t.id, t.parent_id, t.name, t.sort,
    coalesce(sum(m.answered), 0) as answered,
    coalesce(sum(m.earned), 0) as earned,
    coalesce(sum(m.possible), 0) as possible,
    100 * sum(m.earned) / nullif(sum(m.possible), 0) as pct,
    max(m.last_answered) as last_answered,
    count(distinct m.session_id) filter (where m.answered > 0) as sessions
  from public.topics t left join topic_marks m on m.topic_id = t.id
    or (t.parent_id is null and m.parent_id = t.id)
  group by t.id, t.parent_id, t.name, t.sort
), types as (
  select type as id, count(*) filter (where answered) as answered,
    sum(mark) as earned, sum(max_marks) as possible,
    100 * sum(mark) / nullif(sum(max_marks), 0) as pct
  from marked where type is not null group by type
), verbs as (
  select verb as id, count(*) as answered,
    100 * sum(mark) / nullif(sum(max_marks), 0) as pct
  from marked where answered and nullif(btrim(verb), '') is not null
  group by verb having count(*) >= 3
), history_sessions as materialized (
  select h.id, h.kind, s.config, s.elapsed_s, h.finished_at, h.pct
  from public.score_history h join public.sessions s on s.id = h.id
  cross join bounds b
  where h.user_id = b.uid and h.finished_at < b.hi
    and (b.lo is null or h.finished_at >= b.lo)
), history_type_marks as (
  -- History is bounded by session finish, not attempt marking time.
  select h.id as session_id,
    coalesce(q.type, case when h.kind = 'single' then
      case when (h.config -> 'question' ->> 'marks')::int > 8 then 'extended' else 'short' end end) as type,
    100 * sum(a.mark) / nullif(sum(a.max_marks), 0) as pct
  from history_sessions h join public.attempts a on a.session_id = h.id
  left join public.questions q on q.id = a.question_id
  cross join bounds b
  where a.user_id = b.uid and a.status = 'marked' and a.mark is not null and a.max_marks > 0
  group by h.id, 2
), history_types as (
  select session_id, jsonb_object_agg(type, pct) filter (where type is not null) as by_type
  from history_type_marks group by session_id
), history as (
  select h.*, coalesce(t.by_type, '{}'::jsonb) as by_type
  from history_sessions h left join history_types t on t.session_id = h.id
), card_state as materialized (
  select f.kind, f.topic_id, p.due_on, p.last_mark,
    case when p.flashcard_id is null then 'New'
      when p.last_mark = 1 then 'Known' when p.last_mark = 0.5 then 'Learning'
      else 'Missed' end as state
  from public.flashcards f cross join bounds b
  left join public.flashcard_progress p on p.flashcard_id = f.id and p.user_id = b.uid
  where f.status = 'live' and (f.owner_id is null or f.owner_id = b.uid)
    and ((p.flashcard_id is not null and p.updated_at < b.hi and (b.lo is null or p.updated_at >= b.lo))
      or (p.flashcard_id is null and f.created_at < b.hi and (b.lo is null or f.created_at >= b.lo)))
), mastery as (
  select kind as id, count(*) filter (where state = 'Known') as known,
    count(*) filter (where state = 'Learning') as learning,
    count(*) filter (where state = 'Missed') as missed,
    count(*) filter (where state = 'New') as new
  from card_state group by kind
), missed as (
  select c.topic_id as id, t.name, count(*) as missed
  from card_state c join public.topics t on t.id = c.topic_id
  where c.last_mark < 1 group by c.topic_id, t.name
), due as (
  select d::date as day, count(c.due_on) as count
  from generate_series(p_to::timestamp, (p_to + 6)::timestamp, interval '1 day') d
  left join card_state c on case when d::date = p_to then c.due_on <= p_to else c.due_on = d::date end
  group by d
)
select jsonb_build_object(
  -- Preserve overview totals for already deployed RPC clients.
  'stats', (select jsonb_build_object('answered', count(*) filter (where answered),
    'earned', coalesce(sum(mark), 0), 'possible', coalesce(sum(max_marks), 0),
    'pct', 100 * sum(mark) / nullif(sum(max_marks), 0),
    'active', (select count(*) from public.activity_days((select uid from bounds), p_from, p_to))) from marked),
  'topics', coalesce((select jsonb_agg(t order by t.sort, t.id) from topic_rows t), '[]'::jsonb),
  'types', coalesce((select jsonb_agg(t order by t.id) from types t), '[]'::jsonb),
  'verbs', coalesce((select jsonb_agg(v order by v.pct, v.id) from verbs v), '[]'::jsonb),
  'history', coalesce((select jsonb_agg(h order by h.finished_at, h.id) from history h), '[]'::jsonb),
  'mastery', coalesce((select jsonb_agg(m order by m.id) from mastery m), '[]'::jsonb),
  'missed', coalesce((select jsonb_agg(m order by m.missed desc, m.id) from missed m), '[]'::jsonb),
  'due', coalesce((select jsonb_agg(d order by d.day) from due d), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.admin_save_question(p_row jsonb, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_old public.questions;
  v_new public.questions;
  v_time timestamptz := clock_timestamp();
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  v_new := jsonb_populate_record(null::public.questions, p_row);
  if not exists (select 1 from public.topics where id = v_new.topic_id and parent_id is not null) then
    return jsonb_build_object('error', 'Choose a subtopic.'); end if;
  if p_expected is null then
    return jsonb_build_object('error', 'Import questions before editing them.');
  end if;
    select * into v_old from public.questions where id = v_new.id for update;
    if not found then return jsonb_build_object('error', 'This question no longer exists.'); end if;
    if v_old.updated_at <> p_expected then return jsonb_build_object('conflict', v_old.updated_at); end if;
    if (v_new.type <> v_old.type or v_new.marks <> v_old.marks) and
      exists (select 1 from public.attempts where question_id = v_old.id) then
      return jsonb_build_object('error', 'Has attempts. Type and marks are locked.'); end if;
    update public.questions set type=v_new.type,topic_id=v_new.topic_id,marks=v_new.marks,
      source=v_new.source,year=v_new.year,stem=v_new.stem,stimulus=v_new.stimulus,options=v_new.options,
      correct_index=v_new.correct_index,explanation=v_new.explanation,criteria=v_new.criteria,
      guideline_notes=v_new.guideline_notes,sample_answer=v_new.sample_answer,status=v_new.status,updated_at=v_time
    where id=v_new.id;
  return jsonb_build_object('ok', true, 'id', v_new.id, 'updated_at', v_time);
end;
$$;

CREATE OR REPLACE FUNCTION public.question_import_review(p_threshold double precision DEFAULT 0.82, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id text, draft jsonb, "row" jsonb, score double precision)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
      and not exists (select 1 from public.unpublished_paper_questions u where u.question_id = d.id)
      and (coalesce(p_filters->>'q', '') = '' or strpos(lower(concat_ws(' ', d.id, d.source, d.stem, m.id, m.source, m.stem)), lower(p_filters->>'q')) > 0)
      and (coalesce(p_filters->>'type', '') = '' or d.type = p_filters->>'type')
      and (coalesce(p_filters->>'topic', '') = '' or d.topic_id = p_filters->>'topic' or exists (
        select 1 from public.topics t where t.id = d.topic_id and t.parent_id = p_filters->>'topic'))
      and (coalesce(p_filters->>'from', '') !~ '^[0-9]{4}$' or d.year >= case when p_filters->>'from' ~ '^[0-9]{4}$' then (p_filters->>'from')::int end)
      and (coalesce(p_filters->>'to', '') !~ '^[0-9]{4}$' or d.year <= case when p_filters->>'to' ~ '^[0-9]{4}$' then (p_filters->>'to')::int end)
      and (coalesce(p_filters->>'origin', '') = '' or d.origin = p_filters->>'origin')
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
$_$;

ALTER TABLE public.questions DROP COLUMN verb;
