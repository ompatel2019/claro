-- Requires Om/master sign-off before production application.
-- KILL_LIST E7: attempts_check_status_check (NOT NULL; skipped/agreed/second_pass/in_review/reviewed)
-- makes check_status = 'pending' impossible. Drop only those checker-status predicates:
-- `check_status <> 'pending'` is always true and `... and check_status = 'pending'` always false.
-- Bodies are otherwise the live definitions verbatim; CREATE OR REPLACE keeps owner and grants.
-- Attempt status = 'pending' (a real state) is untouched. admin_student_rows is handled by E9.

CREATE OR REPLACE FUNCTION public.activity_stats(p_filters jsonb, p_labels jsonb)
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

CREATE OR REPLACE FUNCTION public.admin_open_student_review(p_attempt uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_attempt public.attempts%rowtype; v_review uuid;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  select * into v_attempt from public.attempts where id = p_attempt for update;
  if not found then raise exception 'Attempt missing'; end if;
  if not exists (select 1 from public.sessions s where s.id = v_attempt.session_id and s.finished_at is not null)
    or (v_attempt.question_id is not null and exists (select 1 from public.questions q where q.id = v_attempt.question_id and q.type = 'mcq'))
    or v_attempt.status not in ('marked', 'failed', 'unreadable')
  then raise exception 'Only finished written answers can be reviewed'; end if;
  select id into v_review from public.mark_reviews where attempt_id = p_attempt and status = 'open';
  if v_review is null then
    insert into public.mark_reviews (attempt_id, user_id, reason, ai_mark, ai_model)
    values (p_attempt, v_attempt.user_id, 'spot_check', v_attempt.mark, v_attempt.marked_by_model)
    on conflict (attempt_id) where status = 'open' do nothing returning id into v_review;
    if v_review is null then
      select id into v_review from public.mark_reviews where attempt_id = p_attempt and status = 'open';
    end if;
  end if;
  update public.attempts set check_status = 'in_review' where id = p_attempt;
  return v_review;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_student_detail(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_monday date := date_trunc('week', now() at time zone 'Australia/Sydney')::date;
  v_result jsonb;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  with days as (
    select * from public.activity_days(p_user, v_monday - 7, v_today)
  ), marks as (
    select a.mark, a.max_marks, (a.marked_at at time zone 'Australia/Sydney')::date as day
    from public.attempts a
    where a.user_id = p_user and a.status = 'marked'
      and a.mark is not null and a.max_marks > 0 and a.marked_at <= now()
      and a.marked_at >= ((v_today - 59)::timestamp at time zone 'Australia/Sydney')
  ), usage as (
    select u.task, count(*) as calls, sum(u.input_tokens + u.output_tokens) as tokens, sum(u.usd) as usd
    from public.ai_usage u where u.user_id = p_user and u.created_at between now() - interval '30 days' and now()
    group by u.task
  ), activity as (
    select s.started_at as at from public.sessions s where s.user_id = p_user
    union all select s.finished_at from public.sessions s where s.user_id = p_user
    union all select a.marked_at from public.attempts a where a.user_id = p_user
    union all select r.created_at from public.flashcard_reviews r where r.user_id = p_user
  )
  select jsonb_build_object(
    'week', jsonb_build_object('thisWeek', coalesce((select sum(questions) from days where day >= v_monday), 0),
      'lastWeek', coalesce((select sum(questions) from days where day < v_monday), 0)),
    'averages', jsonb_build_object('avg30', (select 100 * sum(mark) / nullif(sum(max_marks), 0) from marks where day >= v_today - 29),
      'prev30', (select 100 * sum(mark) / nullif(sum(max_marks), 0) from marks where day < v_today - 29)),
    'due', jsonb_build_object('today', (select count(*) from public.flashcard_progress where user_id = p_user and due_on <= v_today),
      'tomorrow', (select count(*) from public.flashcard_progress where user_id = p_user and due_on = v_today + 1)),
    'streaks', (select to_jsonb(s) from public.activity_streaks(p_user) s),
    'lastActive', (select max(at) from activity where at <= now()),
    'callsLastHour', (select count(*) from public.ai_usage where user_id = p_user and created_at between now() - interval '1 hour' and now()),
    'spend30', coalesce((select sum(usd) from usage), 0),
    'usage', coalesce((select jsonb_agg(usage order by task) from usage), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_student_topics(p_user uuid)
 RETURNS TABLE(topic_id text, parent_id text, earned numeric, possible bigint, answered bigint, last_answered timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  return query with marked as (
    select q.topic_id, a.mark, a.max_marks, a.marked_at,
      a.feedback->>'note' is distinct from 'No answer' and
        (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
          or btrim(coalesce(a.transcript, '')) <> '' or coalesce(cardinality(a.image_paths), 0) > 0) as answered
    from public.attempts a join public.questions q on q.id = a.question_id
    where a.user_id = p_user and a.status = 'marked'
      and a.mark is not null and a.marked_at <= now()
  ), expanded as (
    select m.* from marked m
    union all select t.parent_id, m.mark, m.max_marks, m.marked_at, m.answered
      from marked m join public.topics t on t.id = m.topic_id where t.parent_id is not null
  )
  select m.topic_id, t.parent_id, sum(m.mark), sum(m.max_marks), count(*) filter (where m.answered), max(m.marked_at)
  from expanded m join public.topics t on t.id = m.topic_id group by m.topic_id, t.parent_id;
end;
$function$;
