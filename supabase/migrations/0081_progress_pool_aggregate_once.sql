-- Rollback:
/*
CREATE OR REPLACE FUNCTION public.student_progress(p_from date DEFAULT NULL::date, p_to date DEFAULT ((now() AT TIME ZONE 'Australia/Sydney'::text))::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with bounds as (
  select (select auth.uid()) as uid,
    p_from::timestamp at time zone 'Australia/Sydney' as lo,
    (p_to + 1)::timestamp at time zone 'Australia/Sydney' as hi
), marked as materialized (
  select a.id, a.session_id,
    coalesce(q.topic_id, s.config -> 'question' ->> 'topic_id') as topic_id,
    coalesce(q.type, case when s.kind = 'single' then
      case when (s.config -> 'question' ->> 'marks')::int > 8 then 'extended' else 'short' end end) as type,
    coalesce(q.verb, nullif(s.config -> 'question' ->> 'verb', '')) as verb,
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
), history as (
  select h.id, h.kind, s.config, s.elapsed_s, h.finished_at,
    h.pct,
    coalesce((select jsonb_object_agg(x.type, x.pct) filter (where x.type is not null) from (
      select coalesce(q.type, case when s.kind = 'single' then
        case when (s.config -> 'question' ->> 'marks')::int > 8 then 'extended' else 'short' end end) as type,
        100 * sum(a.mark) / nullif(sum(a.max_marks), 0) as pct
      from public.attempts a left join public.questions q on q.id = a.question_id
      where a.session_id = h.id and a.user_id = (select uid from bounds)
        and a.status = 'marked' and a.mark is not null and a.max_marks > 0
      group by 1
    ) x), '{}'::jsonb) as by_type
  from public.score_history h join public.sessions s on s.id = h.id
  cross join bounds b
  where h.user_id = b.uid and h.finished_at < b.hi
    and (b.lo is null or h.finished_at >= b.lo)
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
$function$;

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
*/

-- Aggregate history types across eligible sessions; reuse the identical subtopic selector.
-- CREATE OR REPLACE preserves ownership and EXECUTE grants. Both functions remain STABLE invokers.
CREATE OR REPLACE FUNCTION public.student_progress(p_from date DEFAULT NULL::date, p_to date DEFAULT ((now() AT TIME ZONE 'Australia/Sydney'::text))::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with bounds as (
  select (select auth.uid()) as uid,
    p_from::timestamp at time zone 'Australia/Sydney' as lo,
    (p_to + 1)::timestamp at time zone 'Australia/Sydney' as hi
), marked as materialized (
  select a.id, a.session_id,
    coalesce(q.topic_id, s.config -> 'question' ->> 'topic_id') as topic_id,
    coalesce(q.type, case when s.kind = 'single' then
      case when (s.config -> 'question' ->> 'marks')::int > 8 then 'extended' else 'short' end end) as type,
    coalesce(q.verb, nullif(s.config -> 'question' ->> 'verb', '')) as verb,
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
$function$;

create or replace function public.sprint_pool(p_config jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
