-- 0000_baseline.sql (C1): one baseline replacing migrations 0001-0079.
-- Production: master's gate records this as already applied (after a snapshot), so nothing re-runs there.
-- New migrations continue numbering after 0079.
-- Squashed baseline: the schema produced by migrations 0001-0079, generated from a
-- local replay (pg_dump 17) and validated against it. Production already has these applied; never run it on prod.
set check_function_bodies = false;
create extension if not exists pg_trgm with schema extensions;

--
--

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: activity_days(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_days(p_user uuid DEFAULT auth.uid(), p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS TABLE(day date, questions integer, cards integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with q as (
    select (a.marked_at at time zone 'Australia/Sydney')::date as day, count(*)::int as n
    from public.attempts a
    where a.user_id = p_user and a.marked_at is not null
      and a.feedback ->> 'note' is distinct from 'No answer'
      and (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
        or btrim(coalesce(a.transcript, '')) <> '' or cardinality(a.image_paths) > 0)
    group by 1
  ), c as (
    select (first_at at time zone 'Australia/Sydney')::date as day, count(*)::int as n
    from (
      select min(r.created_at) as first_at
      from public.flashcard_reviews r
      where r.user_id = p_user
      group by r.session_id, r.flashcard_id
    ) f
    group by 1
  )
  select day, coalesce(q.n, 0), coalesce(c.n, 0)
  from q full join c using (day)
  where (p_from is null or day >= p_from) and (p_to is null or day <= p_to)
  order by day;
$$;

--
-- Name: activity_stats(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_stats(p_filters jsonb, p_labels jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
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
$$;

--
-- Name: activity_streaks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_streaks(p_user uuid DEFAULT auth.uid()) RETURNS TABLE(current_streak integer, longest_streak integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with runs as (
    select day, day - (row_number() over (order by day))::int as grp from public.activity_days(p_user)
  ), streaks as (
    select count(*)::int as n, max(day) as last from runs group by grp
  )
  select
    coalesce((select n from streaks
      where last >= (now() at time zone 'Australia/Sydney')::date - 1
      order by last desc limit 1), 0),
    coalesce((select max(n) from streaks), 0);
$$;

--
-- Name: admin_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_week date := date_trunc('week', now() at time zone 'Australia/Sydney')::date;
  v_result jsonb;
begin
  -- importReview below filters with % (GIN index); match its 0.82 cut-off so few rows need scoring
  perform set_config('pg_trgm.similarity_threshold', '0.82', true);
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  with
  days as (select v_today - n as day from generate_series(0, 29) n),
  recent_sessions as (
    select s.user_id, (s.started_at at time zone 'Australia/Sydney')::date as day
    from public.sessions s join public.profiles p on p.id = s.user_id and p.role = 'student'
    where s.started_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney')
      and s.started_at <= now()
  ),
  activity as (
    select s.user_id, s.started_at as at from public.sessions s
    union all select s.user_id, s.finished_at from public.sessions s where s.finished_at is not null
    union all select a.user_id, a.marked_at from public.attempts a where a.marked_at is not null
    union all select r.user_id, r.created_at from public.flashcard_reviews r
  ),
  student_activity as (
    select a.user_id, (a.at at time zone 'Australia/Sydney')::date as day
    from activity a join public.profiles p on p.id = a.user_id and p.role = 'student'
    where a.at >= ((v_today - 13)::timestamp at time zone 'Australia/Sydney') and a.at <= now()
  ),
  session_days as (select day, count(*) as value from recent_sessions group by day),
  spend_days as (
    select (u.created_at at time zone 'Australia/Sydney')::date as day, sum(u.usd) as value
    from public.ai_usage u
    where u.created_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney') and u.created_at <= now()
    group by 1
  ),
  checked as (
    select a.check_status,
      exists (select 1 from public.mark_reviews r where r.attempt_id = a.id and r.reason = 'check_disagreed') as disagreed
    from public.attempts a
    where a.status = 'marked' and a.check_status <> 'skipped'
      and a.marked_at >= (v_week::timestamp at time zone 'Australia/Sydney') and a.marked_at <= now()
  ),
  latest as (
    select s.id, s.user_id, coalesce(nullif(p.full_name, ''), 'Student') as name,
      s.kind, s.config->>'mode' as mode, s.score, s.max_score as max, s.finished_at
    from public.sessions s join public.profiles p on p.id = s.user_id and p.role = 'student'
    where s.finished_at is not null
    order by s.finished_at desc, s.id desc limit 10
  )
  select jsonb_build_object(
    'students', (select count(*) from public.profiles where role = 'student'),
    'active', jsonb_build_object(
      'now', (select count(distinct user_id) from student_activity where day >= v_today - 6),
      'prev', (select count(distinct user_id) from student_activity where day between v_today - 13 and v_today - 7)),
    'sessionsWeek', (select count(*) from recent_sessions where day >= v_today - 6),
    'openReviews', (select jsonb_build_object('count', count(*), 'oldestDays',
      v_today - (min(created_at) at time zone 'Australia/Sydney')::date)
      from public.mark_reviews where status = 'open'),
    'spend', (select jsonb_build_object('month', coalesce(sum(usd) filter (where
      created_at >= (date_trunc('month', v_today::timestamp) at time zone 'Australia/Sydney')), 0),
      'all', coalesce(sum(usd), 0)) from public.ai_usage where created_at <= now()),
    'sessionsTotal', (select count(*) from recent_sessions),
    'spendTotal', (select coalesce(sum(value), 0) from spend_days),
    'sessionsPerDay', (select jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(s.value, 0)) order by d.day)
      from days d left join session_days s using (day)),
    'spendPerDay', (select jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(s.value, 0)) order by d.day)
      from days d left join spend_days s using (day)),
    'attention', jsonb_build_object(
      'failed', (select count(*) from public.attempts where status in ('failed', 'unreadable')
        and created_at >= ((v_today - 6)::timestamp at time zone 'Australia/Sydney') and created_at <= now()),
      'newFeedback', (select count(*) from public.feedback where status = 'new'),
      'contentReports', (select count(*) from public.feedback where kind = 'content' and status <> 'resolved'),
      'importReview', (select count(*) from public.questions d where d.status = 'draft'
        and not exists (select 1 from public.unpublished_paper_questions u where u.question_id = d.id) and (
        d.duplicate_of is not null or exists (select 1 from public.questions q where q.id <> d.id
          and q.status <> 'retired' and q.stem operator(extensions.%) d.stem
          and extensions.similarity(d.stem, q.stem) >= 0.82))),
      'agreement', (select 100.0 * count(*) filter (where check_status = 'agreed' or
        (check_status in ('in_review', 'reviewed') and not disagreed)) / nullif(count(*), 0) from checked)),
    'latest', (select coalesce(jsonb_agg(to_jsonb(l) order by l.finished_at desc, l.id desc), '[]'::jsonb) from latest l)
  ) into v_result;
  return v_result;
end;
$$;

--
-- Name: admin_delete_question(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_question(p_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_status text;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  select status into v_status from public.questions where id=p_id for update;
  if not found or v_status <> 'draft' or exists(select 1 from public.attempts where question_id=p_id) then
    return false; end if;
  delete from public.questions where id=p_id;
  return true;
end;
$$;

--
-- Name: admin_dispute_history(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_dispute_history(p_users uuid[]) RETURNS TABLE(user_id uuid, total bigint, open bigint, resolved bigint, rejected bigint, latest_rejected_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  return query select r.user_id, count(*), count(*) filter(where r.status = 'open'),
    count(*) filter(where r.status = 'resolved'),
    count(*) filter(where r.status = 'resolved' and r.final_mark <= r.ai_mark),
    max(r.resolved_at) filter(where r.status = 'resolved' and r.final_mark <= r.ai_mark)
    from public.mark_reviews r where r.reason = 'student_dispute' and r.user_id = any(p_users) group by r.user_id;
end;
$$;

--
-- Name: admin_flashcard_rows(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_flashcard_rows() RETURNS TABLE(id text, front text, back text, kind text, topic_id text, status text, origin text, updated_at timestamp with time zone, reviews bigint, knew_first numeric, avg numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return query
  with reviewed as (
    select r.flashcard_id, r.session_id, r.mark,
      row_number() over (partition by r.flashcard_id, r.session_id order by r.created_at, r.id) as attempt
    from public.flashcard_reviews r
    join public.flashcards f on f.id = r.flashcard_id and f.owner_id is null
  ), stats as (
    select r.flashcard_id, count(*) as reviews,
      round(100 * avg(case when r.mark = 1 then 1 else 0 end)
        filter (where r.session_id is not null and r.attempt = 1)) as knew_first,
      round(100 * avg(r.mark)) as avg
    from reviewed r group by r.flashcard_id
  )
  select f.id, f.front, f.back, f.kind, f.topic_id, f.status, f.origin, f.updated_at,
    coalesce(s.reviews, 0), s.knew_first, s.avg
  from public.flashcards f left join stats s on s.flashcard_id = f.id
  where f.owner_id is null;
end;
$$;

--
-- Name: admin_open_student_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_open_student_review(p_attempt uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
$$;

--
-- Name: admin_question_stats(text[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_question_stats(p_ids text[], p_detail boolean DEFAULT false) RETURNS TABLE(id text, attempts bigint, avg numeric, disagreements bigint, reports bigint, histogram jsonb, picks jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  return query
  with requested as materialized (
    select q.id, q.marks, q.correct_index from public.questions q where q.id = any(p_ids)
  ), attempts as materialized (
    select t.id, t.question_id, t.status, t.mark, t.max_marks, t.check_status, t.choice_index
    from public.attempts t join requested q on q.id = t.question_id
  ), reviews as (
    select distinct r.attempt_id from public.mark_reviews r
    join attempts t on t.id = r.attempt_id where r.reason = 'check_disagreed'
  ), totals as (
    select t.question_id, count(*) as n,
      round(100.0 * sum(t.mark) filter (where t.status = 'marked') /
        nullif(sum(t.max_marks) filter (where t.status = 'marked' and t.mark is not null), 0)) as avg,
      count(*) filter (where t.check_status = 'second_pass' or r.attempt_id is not null) as disagreements,
      count(*) filter (where p_detail and t.status = 'marked' and t.choice_index is not null) as picks,
      count(*) filter (where p_detail and t.status = 'marked' and t.choice_index = 0) as pick0,
      count(*) filter (where p_detail and t.status = 'marked' and t.choice_index = 1) as pick1,
      count(*) filter (where p_detail and t.status = 'marked' and t.choice_index = 2) as pick2,
      count(*) filter (where p_detail and t.status = 'marked' and t.choice_index = 3) as pick3
    from attempts t left join reviews r on r.attempt_id = t.id group by t.question_id
  ), bins as (
    select t.question_id, t.mark, count(*) as n from attempts t
    where p_detail and t.status = 'marked' group by t.question_id, t.mark
  ), histograms as (
    select q.id, jsonb_agg(coalesce(b.n, 0) order by bin) as histogram
    from requested q cross join lateral generate_series(0, q.marks) bin
    left join bins b on b.question_id = q.id and b.mark = bin
    where p_detail group by q.id
  ), reports as (
    select f.question_id, count(*) as n from public.feedback f
    join requested q on q.id = f.question_id
    where f.kind = 'content' and f.status <> 'resolved' group by f.question_id
  ), picks as (
    select q.id, coalesce(a.picks, 0) as n, jsonb_build_array(
      coalesce(round(100.0 * a.pick0 / nullif(a.picks, 0)), 0),
      coalesce(round(100.0 * a.pick1 / nullif(a.picks, 0)), 0),
      coalesce(round(100.0 * a.pick2 / nullif(a.picks, 0)), 0),
      coalesce(round(100.0 * a.pick3 / nullif(a.picks, 0)), 0)) as rates
    from requested q left join totals a on a.question_id = q.id
  )
  select q.id, coalesce(a.n, 0), a.avg, coalesce(a.disagreements, 0), coalesce(f.n, 0),
    case when p_detail then h.histogram else '[]'::jsonb end,
    jsonb_build_object('rates', picks.rates, 'picks', picks.n,
      'flagged', picks.n > 0 and q.correct_index is not null and
        (picks.rates->>q.correct_index)::numeric < 25 and exists (
          select 1 from jsonb_array_elements_text(picks.rates) with ordinality r(rate, pos)
          where pos <> q.correct_index + 1 and rate::numeric >= 50))
  from requested q
  left join totals a on a.question_id = q.id
  left join reports f on f.question_id = q.id
  left join histograms h on h.id = q.id
  join picks on picks.id = q.id;
end;
$$;

--
-- Name: admin_reserve_test_mark(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reserve_test_mark() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id bigint;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':admin_test', 0));
  if exists(select 1 from public.ai_usage where user_id=auth.uid() and task='admin_test_request'
      and model='request' and created_at >= now() - interval '4 minutes') then return null; end if;
  if (select count(*) from public.ai_usage where user_id = auth.uid() and task = 'admin_test_request'
      and created_at >= now() - interval '1 minute') >= 5
    or (select count(*) from public.ai_usage where user_id = auth.uid() and task = 'admin_test_request'
      and created_at >= now() - interval '1 hour') >= 30 then return null; end if;
  insert into public.ai_usage(user_id, task, model, input_tokens, output_tokens, usd)
    values(auth.uid(), 'admin_test_request', 'request', 0, 0, 0) returning id into v_id;
  return v_id;
end;
$$;

--
-- Name: admin_save_question(jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_save_question(p_row jsonb, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
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
    update public.questions set type=v_new.type,topic_id=v_new.topic_id,marks=v_new.marks,verb=v_new.verb,
      source=v_new.source,year=v_new.year,stem=v_new.stem,stimulus=v_new.stimulus,options=v_new.options,
      correct_index=v_new.correct_index,explanation=v_new.explanation,criteria=v_new.criteria,
      guideline_notes=v_new.guideline_notes,sample_answer=v_new.sample_answer,status=v_new.status,updated_at=v_time
    where id=v_new.id;
  return jsonb_build_object('ok', true, 'id', v_new.id, 'updated_at', v_time);
end;
$$;

--
-- Name: admin_student_attempts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_student_attempts(p_user uuid) RETURNS TABLE(id uuid, session_id uuid, status text, check_status text, answered boolean, day date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  return query select a.id, a.session_id, a.status, a.check_status,
    a.feedback->>'note' is distinct from 'No answer' and
      (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
        or btrim(coalesce(a.transcript, '')) <> '' or coalesce(cardinality(a.image_paths), 0) > 0),
    (a.marked_at at time zone 'Australia/Sydney')::date
  from public.attempts a where a.user_id = p_user;
end;
$$;

--
-- Name: admin_student_detail(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_student_detail(p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
$$;

--
-- Name: admin_student_rows(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_student_rows() RETURNS TABLE(id uuid, full_name text, year_level smallint, school text, joined timestamp with time zone, last_active timestamp with time zone, sessions_7d bigint, sessions_total bigint, answered bigint, avg_30 numeric, streak integer, open_disputes bigint, ai_spend numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_today date := (now() at time zone 'Australia/Sydney')::date;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  return query
  with sessions as (
    select s.user_id, count(*) as total,
      count(*) filter (where s.started_at >= ((v_today - 6)::timestamp at time zone 'Australia/Sydney')) as recent
    from public.sessions s where s.started_at <= now() group by s.user_id
  ), marks as (
    select a.user_id,
      count(*) filter (where a.feedback->>'note' is distinct from 'No answer'
        and (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
          or btrim(coalesce(a.transcript, '')) <> '' or cardinality(a.image_paths) > 0)) as answered,
      round(100 * sum(a.mark) filter (where a.status = 'marked'
        and a.max_marks > 0 and a.mark is not null
        and a.marked_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney')) /
        nullif(sum(a.max_marks) filter (where a.status = 'marked'
        and a.max_marks > 0 and a.mark is not null
        and a.marked_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney')), 0)) as avg
    from public.attempts a where a.marked_at <= now() group by a.user_id
  ), active_days as (
    select a.user_id, (a.marked_at at time zone 'Australia/Sydney')::date as day
    from public.attempts a where a.marked_at is not null
      and a.feedback->>'note' is distinct from 'No answer'
      and (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
        or btrim(coalesce(a.transcript, '')) <> '' or cardinality(a.image_paths) > 0)
    union
    select r.user_id, (min(r.created_at) at time zone 'Australia/Sydney')::date
    from public.flashcard_reviews r group by r.user_id, r.session_id, r.flashcard_id
  ), runs as (
    select a.user_id, a.day,
      a.day - (row_number() over (partition by a.user_id order by a.day))::int as grp
    from active_days a
  ), streaks as (
    select r.user_id, count(*)::int as n, max(r.day) as last
    from runs r group by r.user_id, r.grp
  ), current_streaks as (
    -- Like activity_streaks, choose the latest run, including future active days.
    select distinct on (s.user_id) s.user_id, s.n as current_streak
    from streaks s where s.last >= v_today - 1 order by s.user_id, s.last desc
  ), activity as (
    select s.user_id, s.started_at as at from public.sessions s
    union all select s.user_id, s.finished_at from public.sessions s where s.finished_at is not null
    union all select a.user_id, a.marked_at from public.attempts a where a.marked_at is not null
    union all select r.user_id, r.created_at from public.flashcard_reviews r
  ), last_activity as (
    select a.user_id, max(a.at) as at from activity a where a.at <= now() group by a.user_id
  ), disputes as (
    select r.user_id, count(*) as n from public.mark_reviews r
    where r.status = 'open' and r.reason = 'student_dispute' group by r.user_id
  ), spend as (
    select u.user_id, sum(u.usd) as usd from public.ai_usage u
    where u.created_at <= now() group by u.user_id
  )
  select p.id, p.full_name, p.year_level, p.school, p.created_at, l.at,
    coalesce(s.recent, 0), coalesce(s.total, 0), coalesce(m.answered, 0), m.avg,
    coalesce(st.current_streak, 0), coalesce(d.n, 0), coalesce(u.usd, 0)
  from public.profiles p
  left join sessions s on s.user_id = p.id
  left join marks m on m.user_id = p.id
  left join last_activity l on l.user_id = p.id
  left join disputes d on d.user_id = p.id
  left join spend u on u.user_id = p.id
  left join current_streaks st on st.user_id = p.id
  where p.role = 'student';
end;
$$;

--
-- Name: admin_student_topics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_student_topics(p_user uuid) RETURNS TABLE(topic_id text, parent_id text, earned numeric, possible bigint, answered bigint, last_answered timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
$$;

--
-- Name: ai_spend(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_spend() RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ select coalesce(sum(usd), 0) from public.ai_usage $$;

--
-- Name: ai_spend_for_prefixes(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_spend_for_prefixes(p_prefixes text[]) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(sum(u.usd), 0) from public.ai_usage u
  where exists (select 1 from unnest(p_prefixes) p where starts_with(u.model, p))
$$;

--
-- Name: attempts_question_required(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attempts_question_required() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.question_id is null
    and (select kind from public.sessions where id = new.session_id) is distinct from 'single' then
    raise exception 'question_id is required outside single sessions';
  end if;
  return new;
end $$;

--
-- Name: bump_answer_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_answer_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.answer_version := old.answer_version;
  if row(new.answer_text, new.transcript, new.choice_index, new.image_paths)
    is distinct from row(old.answer_text, old.transcript, old.choice_index, old.image_paths) then
    new.answer_version := coalesce(old.answer_version, 0) + 1;
  end if;
  return new;
end $$;

--
-- Name: dedupe_norm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dedupe_norm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

--
-- Name: finish_versioned_session(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_versioned_session(p_id uuid, p_answers jsonb, p_result jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare current_answers jsonb; s public.sessions;
begin
  perform id from public.attempts where session_id = p_id order by id for update;
  select coalesce(jsonb_object_agg(id::text, jsonb_build_array(
    coalesce(answer_version, 0), status, mark, marked_at)), '{}'::jsonb)
    into current_answers from public.attempts where session_id = p_id;
  if current_answers <> p_answers then return null; end if;
  select * into s from public.sessions where id = p_id for update;
  if s.finished_at is not null then return to_jsonb(s); end if;
  update public.sessions set finished_at = now(), score = (p_result->>'score')::numeric,
    max_score = (p_result->>'max_score')::numeric, summary = nullif(p_result->'summary', 'null'::jsonb)
    where id = p_id returning * into s;
  return to_jsonb(s);
end $$;

--
-- Name: guard_review_answer_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_review_answer_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare v integer;
begin
  if new.reason <> 'check_disagreed' or new.answer_version is null then return new; end if;
  select coalesce(answer_version, 0) into v from public.attempts
    where id = new.attempt_id for no key update;
  if v is distinct from new.answer_version then return null; end if;
  delete from public.mark_reviews where attempt_id = new.attempt_id
    and reason = 'check_disagreed' and status = 'open'
    and coalesce(answer_version, 0) < v;
  return new;
end $$;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

--
-- Name: marking_examples_split_fixed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marking_examples_split_fixed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.split is distinct from old.split then raise exception 'split is fixed at import'; end if;
  return new;
end $$;

--
-- Name: question_import_review(double precision, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.question_import_review(p_threshold double precision DEFAULT 0.82, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(id text, draft jsonb, "row" jsonb, score double precision)
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
$_$;

--
-- Name: request_mark_review(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_mark_review(p_attempt uuid, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user uuid := auth.uid();
  v_attempt public.attempts;
  v_week timestamptz := date_trunc('week', now() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney';
begin
  if v_user is null then return jsonb_build_object('error', 'Unauthorised', 'status', 401); end if;
  p_note := regexp_replace(p_note, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if p_note is null or char_length(p_note) not between 10 and 1000 then
    return jsonb_build_object('error', 'Tell us what we missed in 10 to 1,000 characters.', 'status', 400);
  end if;
  perform id from public.profiles where id = v_user for update;
  select a.* into v_attempt from public.attempts a where a.id = p_attempt and a.user_id = v_user for update;
  if not found then return jsonb_build_object('error', 'Attempt not found', 'status', 404); end if;
  if exists (select 1 from public.mark_reviews where attempt_id = p_attempt and reason = 'student_dispute') then
    return jsonb_build_object('error', 'You have already questioned this mark.', 'status', 409);
  end if;
  if v_attempt.status <> 'marked' or v_attempt.check_status not in ('agreed', 'reviewed', 'skipped', 'second_pass')
    or v_attempt.feedback->>'note' = 'No answer'
    or not exists (select 1 from public.sessions where id = v_attempt.session_id and finished_at is not null)
    or exists (select 1 from public.questions where id = v_attempt.question_id and type = 'mcq') then
    return jsonb_build_object('error', 'This mark can’t be questioned right now.', 'status', 409);
  end if;
  if exists (select 1 from public.mark_reviews where attempt_id = p_attempt and status = 'open') then
    return jsonb_build_object('error', 'This mark is already being checked.', 'status', 409);
  end if;
  if (select count(*) from public.mark_reviews where user_id = v_user and reason = 'student_dispute' and status = 'open') >= 3 then
    return jsonb_build_object('error', 'You have 3 marks being checked. You can question another once one is done.', 'status', 429);
  end if;
  if (select count(*) from public.mark_reviews where user_id = v_user and reason = 'student_dispute' and created_at >= v_week) >= 5 then
    return jsonb_build_object('error', 'You can question up to 5 marks per Sydney week. Try again next Monday.', 'status', 429);
  end if;
  if exists (select 1 from public.mark_reviews where user_id = v_user and reason = 'student_dispute' and status = 'resolved'
    and final_mark <= ai_mark and resolved_at > now() - interval '48 hours') then
    return jsonb_build_object('error', 'Wait 48 hours after an unchanged or lowered review before questioning another mark.', 'status', 429);
  end if;
  insert into public.mark_reviews(attempt_id,user_id,reason,ai_mark,student_note)
    values(p_attempt,v_user,'student_dispute',v_attempt.mark,p_note);
  update public.attempts set check_status = 'in_review' where id = p_attempt;
  return jsonb_build_object('ok', true);
end;
$_$;

--
-- Name: save_sprint_answer(uuid, uuid, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_sprint_answer(p_id uuid, p_user uuid, p_version integer, p_status text, p_patch jsonb) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare a public.attempts; s public.sessions; n public.attempts;
begin
  select * into a from public.attempts where id = p_id and user_id = p_user for update;
  if not found or coalesce(a.answer_version, 0) <> p_version or a.status <> p_status then return false; end if;
  select * into s from public.sessions where id = a.session_id for update;
  if s.finished_at is not null or s.kind <> 'sprint' or s.config->>'feedback' = 'each'
    or not exists (select 1 from public.questions where id = a.question_id and type <> 'mcq') then
    return false;
  end if;
  n := jsonb_populate_record(a, p_patch);
  update public.attempts set answer_text = n.answer_text, transcript = n.transcript,
    image_paths = n.image_paths, flagged = n.flagged, status = n.status,
    claimed_at = n.claimed_at, mark = n.mark, max_marks = n.max_marks, band = n.band,
    feedback = n.feedback, marked_at = n.marked_at, check_status = n.check_status,
    marked_by_model = n.marked_by_model
  where id = p_id and coalesce(answer_version, 0) = p_version;
  if not found then return false; end if;
  delete from public.mark_reviews where attempt_id = p_id
    and reason = 'check_disagreed' and status = 'open'
    and coalesce(answer_version, 0) < (select answer_version from public.attempts where id = p_id);
  return true;
end $$;

--
-- Name: session_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_review(p_session uuid) RETURNS TABLE(attempt_id uuid, "position" smallint, question_id text, type text, marks smallint, stem text, stimulus text, options text[], source text, topic_id text, year smallint, choice_index smallint, answer_text text, transcript text, image_paths text[], flagged boolean, status text, check_status text, mark numeric, max_marks smallint, band text, feedback jsonb, correct_index smallint, criteria jsonb, sample_answer text, explanation text, review jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.id, a.position, a.question_id, q.type, q.marks, q.stem, q.stimulus, q.options, q.source,
    q.topic_id, q.year,
    a.choice_index, a.answer_text, a.transcript, a.image_paths, a.flagged,
    a.status, a.check_status, a.mark, a.max_marks, a.band, a.feedback #- '{flags,uncertain}' #- '{flags,marks}',
    q.correct_index, q.criteria, q.sample_answer, q.explanation,
    (select jsonb_build_object('status', r.status, 'reason', r.reason,
        'final_mark', r.final_mark)
      from public.mark_reviews r where r.attempt_id = a.id
      order by (r.status = 'open') desc, r.created_at desc limit 1)
  from public.sessions s
  join public.attempts a on a.session_id = s.id
  left join public.questions q on q.id = a.question_id
  where s.id = p_session and s.finished_at is not null
    and (s.user_id = (select auth.uid()) or (select public.is_admin()))
  order by a.position;
$$;

--
-- Name: sprint_pool(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sprint_pool(p_config jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
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

--
-- Name: sprint_questions(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sprint_questions(p_config jsonb) RETURNS TABLE(id text, type text, marks smallint, topic_id text, year smallint, verb text, origin text, source text, seen boolean, last_seen timestamp with time zone, mistake boolean, flagged boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
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
$$;

--
-- Name: start_sprint(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_sprint(p_config jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_mode text := p_config ->> 'mode';
  v_size_by text := coalesce(p_config ->> 'size_by', case when v_mode = 'mcq' then 'questions' else 'marks' end);
  v_target int := coalesce((p_config ->> 'target')::int,
    case v_mode when 'mcq' then 20 when 'short' then 30 else 45 end);
  v_history text := coalesce(p_config ->> 'history', 'prefer_new');
  v_timed boolean := coalesce((p_config ->> 'timed')::boolean, true);
  v_short_pace numeric := coalesce((p_config ->> 'short_min_per_mark')::numeric, 1.5);
  v_mcq_pace numeric := coalesce((p_config ->> 'mcq_min_per_q')::numeric, 1);
  v_feedback text := coalesce(p_config ->> 'feedback', 'end');
  v_lo int;
  v_hi int;
  v_mcq_target int;
  v_short_target int;
  v_paths jsonb := '{"0":[]}';
  v_budget int;
  v_short_ceiling int;
  v_mcq_n int := 0;
  v_short_marks int := 0;
  v_picked text[] := '{}';
  v_sum int := 0;
  v_count int := 0;
  v_limit int;
  v_session uuid;
  r record;
begin
  if jsonb_typeof(p_config) is distinct from 'object' or v_mode is null
    or v_mode not in ('mcq', 'short', 'mixed') then raise exception 'invalid mode %', v_mode; end if;
  if jsonb_array_length(coalesce(p_config -> 'topics', '[]')) > 2 then raise exception 'pick at most two topics'; end if;
  if v_history not in ('prefer_new', 'new_only', 'mistakes', 'flagged', 'any')

    or v_feedback not in ('end', 'each')
    then
    raise exception 'invalid sprint settings';
  end if;
  select lo, hi into v_lo, v_hi from (values
    ('mcq', 'questions', 5, 40), ('short', 'marks', 10, 60), ('short', 'questions', 2, 15),
    ('mixed', 'marks', 5, 100)) b(mode, size_by, lo, hi)
  where b.mode = v_mode and b.size_by = v_size_by;
  if v_lo is null or v_target is null or v_target not between v_lo and v_hi then
    raise exception 'size is out of range';
  end if;
  -- Each mixed bucket is independent; missing MCs never become written marks.
  if v_mode = 'mixed' then
    v_mcq_target := coalesce((p_config ->> 'mcq_count')::int,
      v_target - (p_config ->> 'short_marks')::int, (v_target + 1) / 2);
    v_short_target := coalesce((p_config ->> 'short_marks')::int, v_target - v_mcq_target);
    if v_mcq_target < 0 or v_short_target < 0 or v_mcq_target + v_short_target <> v_target then
      raise exception 'invalid mixed counts: must add up to total';
    end if;
    v_short_ceiling := case when v_short_target = 0 then 0 else v_short_target + 2 end;
  end if;

  for r in
    select q.* from public.sprint_questions(p_config - 'include_extended') q
    where case v_history when 'new_only' then not q.seen when 'mistakes' then q.mistake
      when 'flagged' then q.flagged else true end
    order by case when v_history = 'prefer_new' then q.seen end, case when v_history = 'prefer_new' then q.last_seen end,
      random()
  loop
    if v_mode = 'mixed' then
      if r.type = 'mcq' then
        continue when v_mcq_n >= v_mcq_target;
        v_mcq_n := v_mcq_n + 1;
      else
        -- Reachable mark totals (target plus the spec's two-mark tolerance). Descending totals prevent reuse.
        -- Keep the first path, respecting the new-first/random candidate order.
        if not v_paths ? v_short_target::text and r.marks <= v_short_ceiling then
          for v_budget in reverse v_short_ceiling..r.marks loop
            if not v_paths ? v_budget::text and v_paths ? (v_budget - r.marks)::text then
              v_paths := jsonb_set(v_paths, array[v_budget::text],
                (v_paths -> (v_budget - r.marks)::text) || jsonb_build_array(r.id));
            end if;
          end loop;
        end if;
        continue;
      end if;
    elsif v_size_by = 'questions' then
      exit when v_count >= v_target;
    else
      continue when v_sum + r.marks > v_target;
    end if;
    v_picked := v_picked || r.id;
    v_sum := v_sum + r.marks;
    v_count := v_count + 1;
    exit when v_size_by = 'marks' and v_mode <> 'mixed' and v_sum >= v_target;
  end loop;

  if v_mode = 'mixed' then
    select key::int into v_short_marks from jsonb_object_keys(v_paths) paths(key)
    where key::int > 0 or v_short_target = 0
    order by abs(key::int - v_short_target), key::int > v_short_target
    limit 1;
    v_short_marks := coalesce(v_short_marks, 0);
    v_picked := v_picked || array(select jsonb_array_elements_text(v_paths -> v_short_marks::text));
    select count(*), coalesce(sum(q.marks), 0) into v_count, v_sum
      from public.questions q where q.id = any(v_picked);
  end if;

  if v_count = 0 then raise exception 'no questions match these settings'; end if;

  if v_short_pace not between 0.25 and 10 or v_mcq_pace not between 0.25 and 10 then
    raise exception 'invalid sprint pace: use 0.25 to 10 minutes';
  end if;
  select case when v_timed then round(sum(case x.type
    when 'mcq' then 60 * v_mcq_pace
    else 60 * v_short_pace * x.marks end))::int else null end
  into v_limit from public.questions x where x.id = any(v_picked);

  insert into public.sessions (kind, config)
  values ('sprint', jsonb_build_object(
    'mode', v_mode,
    'topics', coalesce(p_config -> 'topics', '[]'), 'subtopics', coalesce(p_config -> 'subtopics', '[]'),
    'size_by', v_size_by, 'target', v_target,
    'difficulty', coalesce(p_config -> 'difficulty', '[]'), 'verbs', coalesce(p_config -> 'verbs', '[]'),
    'year_from', p_config -> 'year_from', 'year_to', p_config -> 'year_to', 'origins', coalesce(p_config -> 'origins', '[]'),
    'history', v_history, 'order', 'exam',
    'timed', v_timed, 'time_limit_s', v_limit, 'short_min_per_mark', v_short_pace, 'mcq_min_per_q', v_mcq_pace, 'on_timeout', 'overtime',
    'feedback', v_feedback, 'actual_marks', v_sum, 'actual_questions', v_count) || case when v_mode = 'mixed' then jsonb_build_object(
    'mcq_count', v_mcq_target, 'short_marks', v_short_target,
    'actual_mcq_count', v_mcq_n, 'actual_short_marks', v_short_marks) else '{}'::jsonb end)
  returning id into v_session;

  insert into public.attempts (session_id, question_id, position)
  select v_session, q.id, row_number() over (order by
    array_position(array['mcq', 'short'], q.type),
    q.year,
    (substring(q.source from 'Q(\d+)'))::int,
    q.source,
    random())
  from public.questions q where q.id = any(v_picked);
  return v_session;
end;
$$;

--
-- Name: student_progress(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_progress(p_from date DEFAULT NULL::date, p_to date DEFAULT ((now() AT TIME ZONE 'Australia/Sydney'::text))::date) RETURNS jsonb
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
$$;

--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    task text NOT NULL,
    model text NOT NULL,
    input_tokens integer NOT NULL,
    cached_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer NOT NULL,
    usd numeric(12,6) NOT NULL,
    attempt_id uuid
);

--
-- Name: ai_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    question_id text,
    "position" smallint NOT NULL,
    choice_index smallint,
    answer_text text,
    transcript text,
    status text DEFAULT 'pending'::text NOT NULL,
    mark numeric,
    max_marks smallint,
    band text,
    feedback jsonb,
    marked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    flagged boolean DEFAULT false NOT NULL,
    claimed_at timestamp with time zone,
    marked_by_model text,
    check_status text DEFAULT 'skipped'::text NOT NULL,
    image_paths text[],
    answer_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT attempts_check_status_check CHECK ((check_status = ANY (ARRAY['skipped'::text, 'agreed'::text, 'second_pass'::text, 'in_review'::text, 'reviewed'::text]))),
    CONSTRAINT attempts_choice_index_check CHECK (((choice_index >= 0) AND (choice_index <= 3))),
    CONSTRAINT attempts_image_paths_check CHECK (((cardinality(image_paths) >= 1) AND (cardinality(image_paths) <= 8))),
    CONSTRAINT attempts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'transcribed'::text, 'marking'::text, 'marked'::text, 'skipped'::text, 'failed'::text, 'unreadable'::text])))
);

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    kind text DEFAULT 'general'::text NOT NULL,
    message text NOT NULL,
    page_path text,
    user_agent text,
    screenshots text[] DEFAULT '{}'::text[] NOT NULL,
    question_id text,
    flashcard_id text,
    session_id uuid,
    status text DEFAULT 'new'::text NOT NULL,
    admin_note text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_kind_check CHECK ((kind = ANY (ARRAY['general'::text, 'bug'::text, 'content'::text, 'marking'::text, 'feature'::text]))),
    CONSTRAINT feedback_message_check CHECK (((char_length(message) >= 3) AND (char_length(message) <= 4000))),
    CONSTRAINT feedback_page_path_check CHECK ((char_length(page_path) <= 500)),
    CONSTRAINT feedback_screenshots_check CHECK ((cardinality(screenshots) <= 5)),
    CONSTRAINT feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'resolved'::text]))),
    CONSTRAINT feedback_user_agent_check CHECK ((char_length(user_agent) <= 500))
);

--
-- Name: flashcard_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcard_progress (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    flashcard_id text NOT NULL,
    interval_days smallint NOT NULL,
    due_on date NOT NULL,
    last_mark numeric NOT NULL,
    reviews integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT flashcard_progress_interval_days_check CHECK (((interval_days >= 0) AND (interval_days <= 365))),
    CONSTRAINT flashcard_progress_last_mark_check CHECK ((last_mark = ANY (ARRAY[(0)::numeric, 0.5, (1)::numeric])))
);

--
-- Name: flashcard_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcard_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    session_id uuid,
    flashcard_id text NOT NULL,
    answer text,
    mark numeric NOT NULL,
    source text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answer_mode text,
    CONSTRAINT flashcard_reviews_answer_mode_check CHECK ((answer_mode = ANY (ARRAY['typed'::text, 'spoken'::text]))),
    CONSTRAINT flashcard_reviews_mark_check CHECK ((mark = ANY (ARRAY[(0)::numeric, 0.5, (1)::numeric]))),
    CONSTRAINT flashcard_reviews_source_check CHECK ((source = ANY (ARRAY['self'::text, 'ai'::text])))
);

--
-- Name: flashcards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcards (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    topic_id text NOT NULL,
    kind text NOT NULL,
    front text NOT NULL,
    back text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid,
    origin text DEFAULT 'claro'::text NOT NULL,
    origin_ref text,
    status text DEFAULT 'live'::text NOT NULL,
    dedupe_key text GENERATED ALWAYS AS (md5(public.dedupe_norm(front))) STORED NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT flashcards_check CHECK (((owner_id IS NULL) = (origin <> 'student'::text))),
    CONSTRAINT flashcards_kind_check CHECK ((kind = ANY (ARRAY['term'::text, 'stat'::text]))),
    CONSTRAINT flashcards_origin_check CHECK ((origin = ANY (ARRAY['a1'::text, 'claro'::text, 'student'::text]))),
    CONSTRAINT flashcards_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'retired'::text])))
);

--
-- Name: legacy_paper_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legacy_paper_sessions (
    session_id uuid NOT NULL,
    paper_id uuid NOT NULL,
    title text
);

--
-- Name: mark_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mark_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    ai_mark numeric,
    ai_model text,
    check_mark numeric,
    check_model text,
    check_notes text,
    student_note text,
    status text DEFAULT 'open'::text NOT NULL,
    final_mark numeric,
    admin_note text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answer_version integer,
    CONSTRAINT mark_reviews_check CHECK (((status = 'resolved'::text) = (resolved_at IS NOT NULL))),
    CONSTRAINT mark_reviews_reason_check CHECK ((reason = ANY (ARRAY['check_disagreed'::text, 'student_dispute'::text, 'spot_check'::text]))),
    CONSTRAINT mark_reviews_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text]))),
    CONSTRAINT mark_reviews_student_note_check CHECK (((char_length(student_note) >= 10) AND (char_length(student_note) <= 1000)))
);

--
-- Name: marking_examples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marking_examples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id text NOT NULL,
    answer_text text NOT NULL,
    tutor_mark numeric NOT NULL,
    band text,
    accepted_tutor_comments jsonb DEFAULT '[]'::jsonb NOT NULL,
    rejected_ai_comments jsonb DEFAULT '[]'::jsonb NOT NULL,
    split text NOT NULL,
    origin text NOT NULL,
    source_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marking_examples_accepted_tutor_comments_check CHECK ((jsonb_typeof(accepted_tutor_comments) = 'array'::text)),
    CONSTRAINT marking_examples_check CHECK (((origin = 'a1'::text) OR (split = 'example'::text))),
    CONSTRAINT marking_examples_origin_check CHECK ((origin = ANY (ARRAY['a1'::text, 'admin_override'::text]))),
    CONSTRAINT marking_examples_rejected_ai_comments_check CHECK ((jsonb_typeof(rejected_ai_comments) = 'array'::text)),
    CONSTRAINT marking_examples_split_check CHECK ((split = ANY (ARRAY['example'::text, 'test'::text])))
);

--
-- Name: marking_examples_for_grader; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.marking_examples_for_grader AS
 SELECT id,
    question_id,
    answer_text,
    tutor_mark,
    band,
    accepted_tutor_comments,
    rejected_ai_comments
   FROM public.marking_examples
  WHERE (split = 'example'::text);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    role text DEFAULT 'student'::text NOT NULL,
    year_level smallint,
    school text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'admin'::text]))),
    CONSTRAINT profiles_year_level_check CHECK ((year_level = ANY (ARRAY[11, 12])))
);

--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id text NOT NULL,
    type text NOT NULL,
    topic_id text NOT NULL,
    marks smallint NOT NULL,
    stem text NOT NULL,
    stimulus text,
    options text[],
    correct_index smallint,
    criteria jsonb,
    guideline_notes text,
    sample_answer text,
    source text NOT NULL,
    year smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'nesa'::text NOT NULL,
    origin_ref text,
    explanation text,
    verb text,
    status text DEFAULT 'live'::text NOT NULL,
    dedupe_key text GENERATED ALWAYS AS (md5(((((((((((type || '|'::text) || public.dedupe_norm(stem)) || '|'::text) || public.dedupe_norm(options[1])) || '|'::text) || public.dedupe_norm(options[2])) || '|'::text) || public.dedupe_norm(options[3])) || '|'::text) || public.dedupe_norm(options[4])))) STORED NOT NULL,
    duplicate_of text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT questions_check CHECK (((type = 'mcq'::text) = ((options IS NOT NULL) AND (correct_index IS NOT NULL)))),
    CONSTRAINT questions_check1 CHECK (((type = 'mcq'::text) OR (criteria IS NOT NULL))),
    CONSTRAINT questions_correct_index_check CHECK (((correct_index >= 0) AND (correct_index <= 3))),
    CONSTRAINT questions_marks_check CHECK ((marks > 0)),
    CONSTRAINT questions_options_check CHECK (((options IS NULL) OR (cardinality(options) = 4))),
    CONSTRAINT questions_origin_check CHECK ((origin = ANY (ARRAY['nesa'::text, 'a1'::text, 'claro'::text]))),
    CONSTRAINT questions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'retired'::text]))),
    CONSTRAINT questions_type_check CHECK ((type = ANY (ARRAY['mcq'::text, 'short'::text, 'extended'::text])))
);

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    kind text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    score numeric,
    max_score numeric,
    summary jsonb,
    elapsed_s integer DEFAULT 0 NOT NULL,
    CONSTRAINT sessions_elapsed_s_check CHECK ((elapsed_s >= 0)),
    CONSTRAINT sessions_kind_check CHECK ((kind = ANY (ARRAY['sprint'::text, 'flashcards'::text, 'paper'::text, 'single'::text])))
);

--
-- Name: score_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.score_history WITH (security_invoker='true') AS
 SELECT s.user_id,
    s.id,
    s.kind,
    (s.config ->> 'mode'::text) AS mode,
    lp.paper_id,
    s.finished_at,
    s.score,
    s.max_score,
    round((((100)::numeric * s.score) / NULLIF(s.max_score, (0)::numeric)), 1) AS pct
   FROM (public.sessions s
     LEFT JOIN public.legacy_paper_sessions lp ON ((lp.session_id = s.id)))
  WHERE (s.finished_at IS NOT NULL);

--
-- Name: student_mark_reviews; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.student_mark_reviews WITH (security_barrier='true') AS
 SELECT id,
    attempt_id,
    user_id,
    created_at,
    reason,
    student_note,
    status,
    final_mark
   FROM public.mark_reviews r
  WHERE (user_id = ( SELECT auth.uid() AS uid));

--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id text NOT NULL,
    parent_id text,
    name text NOT NULL,
    sort smallint NOT NULL
);

--
-- Name: unpublished_paper_question_readers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unpublished_paper_question_readers (
    question_id text NOT NULL,
    user_id uuid NOT NULL
);

--
-- Name: unpublished_paper_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unpublished_paper_questions (
    question_id text NOT NULL
);

--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);

--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);

--
-- Name: attempts attempts_session_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_session_id_question_id_key UNIQUE (session_id, question_id);

--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);

--
-- Name: flashcard_progress flashcard_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_pkey PRIMARY KEY (user_id, flashcard_id);

--
-- Name: flashcard_reviews flashcard_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_reviews
    ADD CONSTRAINT flashcard_reviews_pkey PRIMARY KEY (id);

--
-- Name: flashcards flashcards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_pkey PRIMARY KEY (id);

--
-- Name: legacy_paper_sessions legacy_paper_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_paper_sessions
    ADD CONSTRAINT legacy_paper_sessions_pkey PRIMARY KEY (session_id);

--
-- Name: mark_reviews mark_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mark_reviews
    ADD CONSTRAINT mark_reviews_pkey PRIMARY KEY (id);

--
-- Name: marking_examples marking_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marking_examples
    ADD CONSTRAINT marking_examples_pkey PRIMARY KEY (id);

--
-- Name: marking_examples marking_examples_source_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marking_examples
    ADD CONSTRAINT marking_examples_source_hash_key UNIQUE (source_hash);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);

--
-- Name: unpublished_paper_question_readers unpublished_paper_question_readers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unpublished_paper_question_readers
    ADD CONSTRAINT unpublished_paper_question_readers_pkey PRIMARY KEY (question_id, user_id);

--
-- Name: unpublished_paper_questions unpublished_paper_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unpublished_paper_questions
    ADD CONSTRAINT unpublished_paper_questions_pkey PRIMARY KEY (question_id);

--
-- Name: ai_usage_attempt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_attempt_id ON public.ai_usage USING btree (attempt_id) WHERE (attempt_id IS NOT NULL);

--
-- Name: ai_usage_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_user_created_idx ON public.ai_usage USING btree (user_id, created_at DESC);

--
-- Name: attempts_question_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attempts_question_id_idx ON public.attempts USING btree (question_id);

--
-- Name: attempts_session_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attempts_session_id_position_idx ON public.attempts USING btree (session_id, "position");

--
-- Name: attempts_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attempts_user_id_created_at_idx ON public.attempts USING btree (user_id, created_at DESC);

--
-- Name: attempts_user_id_question_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attempts_user_id_question_id_idx ON public.attempts USING btree (user_id, question_id);

--
-- Name: feedback_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_status_created_at_idx ON public.feedback USING btree (status, created_at DESC);

--
-- Name: feedback_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_user_id_created_at_idx ON public.feedback USING btree (user_id, created_at DESC);

--
-- Name: flashcard_progress_user_id_due_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flashcard_progress_user_id_due_on_idx ON public.flashcard_progress USING btree (user_id, due_on);

--
-- Name: flashcard_reviews_session_id_flashcard_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flashcard_reviews_session_id_flashcard_id_idx ON public.flashcard_reviews USING btree (session_id, flashcard_id);

--
-- Name: flashcard_reviews_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flashcard_reviews_user_id_created_at_idx ON public.flashcard_reviews USING btree (user_id, created_at DESC);

--
-- Name: flashcards_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flashcards_owner_id_idx ON public.flashcards USING btree (owner_id) WHERE (owner_id IS NOT NULL);

--
-- Name: flashcards_shared_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX flashcards_shared_dedupe ON public.flashcards USING btree (kind, dedupe_key) WHERE (owner_id IS NULL);

--
-- Name: flashcards_topic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flashcards_topic_id_idx ON public.flashcards USING btree (topic_id);

--
-- Name: mark_reviews_attempt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mark_reviews_attempt_id_idx ON public.mark_reviews USING btree (attempt_id);

--
-- Name: mark_reviews_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mark_reviews_created_at_idx ON public.mark_reviews USING btree (created_at) WHERE (status = 'open'::text);

--
-- Name: mark_reviews_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mark_reviews_one_open ON public.mark_reviews USING btree (attempt_id) WHERE (status = 'open'::text);

--
-- Name: mark_reviews_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mark_reviews_user_id_created_at_idx ON public.mark_reviews USING btree (user_id, created_at DESC);

--
-- Name: marking_examples_question_id_split_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marking_examples_question_id_split_idx ON public.marking_examples USING btree (question_id, split);

--
-- Name: questions_dedupe_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX questions_dedupe_live ON public.questions USING btree (dedupe_key) WHERE (status <> 'retired'::text);

--
-- Name: questions_origin_origin_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX questions_origin_origin_ref_idx ON public.questions USING btree (origin, origin_ref) WHERE (origin_ref IS NOT NULL);

--
-- Name: questions_status_type_topic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_status_type_topic_id_idx ON public.questions USING btree (status, type, topic_id);

--
-- Name: questions_stem_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_stem_trgm ON public.questions USING gin (stem extensions.gin_trgm_ops);

--
-- Name: questions_topic_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_topic_id_type_idx ON public.questions USING btree (topic_id, type);

--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id) WHERE (finished_at IS NULL);

--
-- Name: sessions_user_id_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_started_at_idx ON public.sessions USING btree (user_id, started_at DESC);

--
-- Name: attempts attempts_answer_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attempts_answer_version BEFORE UPDATE ON public.attempts FOR EACH ROW EXECUTE FUNCTION public.bump_answer_version();

--
-- Name: attempts attempts_question_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER attempts_question_required BEFORE INSERT OR UPDATE OF question_id, session_id ON public.attempts FOR EACH ROW EXECUTE FUNCTION public.attempts_question_required();

--
-- Name: mark_reviews mark_reviews_answer_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mark_reviews_answer_version BEFORE INSERT ON public.mark_reviews FOR EACH ROW EXECUTE FUNCTION public.guard_review_answer_version();

--
-- Name: marking_examples marking_examples_split_fixed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER marking_examples_split_fixed BEFORE UPDATE ON public.marking_examples FOR EACH ROW EXECUTE FUNCTION public.marking_examples_split_fixed();

--
-- Name: ai_usage ai_usage_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE SET NULL;

--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: attempts attempts_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id);

--
-- Name: attempts attempts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

--
-- Name: attempts attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: feedback feedback_flashcard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_flashcard_id_fkey FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id) ON DELETE SET NULL;

--
-- Name: feedback feedback_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE SET NULL;

--
-- Name: feedback feedback_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

--
-- Name: feedback feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: flashcard_progress flashcard_progress_flashcard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_flashcard_id_fkey FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id) ON DELETE CASCADE;

--
-- Name: flashcard_progress flashcard_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_progress
    ADD CONSTRAINT flashcard_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: flashcard_reviews flashcard_reviews_flashcard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_reviews
    ADD CONSTRAINT flashcard_reviews_flashcard_id_fkey FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id) ON DELETE CASCADE;

--
-- Name: flashcard_reviews flashcard_reviews_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_reviews
    ADD CONSTRAINT flashcard_reviews_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

--
-- Name: flashcard_reviews flashcard_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard_reviews
    ADD CONSTRAINT flashcard_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: flashcards flashcards_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: flashcards flashcards_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcards
    ADD CONSTRAINT flashcards_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id);

--
-- Name: legacy_paper_sessions legacy_paper_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legacy_paper_sessions
    ADD CONSTRAINT legacy_paper_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

--
-- Name: mark_reviews mark_reviews_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mark_reviews
    ADD CONSTRAINT mark_reviews_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE CASCADE;

--
-- Name: mark_reviews mark_reviews_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mark_reviews
    ADD CONSTRAINT mark_reviews_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

--
-- Name: mark_reviews mark_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mark_reviews
    ADD CONSTRAINT mark_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: marking_examples marking_examples_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marking_examples
    ADD CONSTRAINT marking_examples_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id);

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: questions questions_duplicate_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.questions(id);

--
-- Name: questions questions_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id);

--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: topics topics_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.topics(id);

--
-- Name: unpublished_paper_question_readers unpublished_paper_question_readers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unpublished_paper_question_readers
    ADD CONSTRAINT unpublished_paper_question_readers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.unpublished_paper_questions(question_id) ON DELETE CASCADE;

--
-- Name: unpublished_paper_question_readers unpublished_paper_question_readers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unpublished_paper_question_readers
    ADD CONSTRAINT unpublished_paper_question_readers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

--
-- Name: unpublished_paper_questions unpublished_paper_questions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unpublished_paper_questions
    ADD CONSTRAINT unpublished_paper_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

--
-- Name: questions admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin insert" ON public.questions FOR INSERT TO authenticated WITH CHECK (( SELECT public.is_admin() AS is_admin));

--
-- Name: ai_usage admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin read" ON public.ai_usage FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));

--
-- Name: flashcard_progress admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin read" ON public.flashcard_progress FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));

--
-- Name: mark_reviews admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin read" ON public.mark_reviews FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));

--
-- Name: marking_examples admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin read" ON public.marking_examples FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));

--
-- Name: feedback admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin update" ON public.feedback FOR UPDATE TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

--
-- Name: mark_reviews admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin update" ON public.mark_reviews FOR UPDATE TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

--
-- Name: questions admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin update" ON public.questions FOR UPDATE TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: questions attempted unpublished paper question; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attempted unpublished paper question" ON public.questions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.unpublished_paper_question_readers r
  WHERE (r.question_id = questions.id))));

--
-- Name: attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

--
-- Name: legacy_paper_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.legacy_paper_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: questions live or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "live or admin read" ON public.questions FOR SELECT TO authenticated USING (((status = 'live'::text) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: mark_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mark_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: marking_examples; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marking_examples ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions no direct paper sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "no direct paper sessions" ON public.sessions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((kind <> 'paper'::text));

--
-- Name: attempts no direct single attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "no direct single attempts" ON public.attempts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM public.sessions s
  WHERE ((s.id = attempts.session_id) AND (s.kind = 'single'::text))))));

--
-- Name: sessions no direct single sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "no direct single sessions" ON public.sessions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((kind <> 'single'::text));

--
-- Name: unpublished_paper_question_readers own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own ON public.unpublished_paper_question_readers FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

--
-- Name: attempts own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own insert" ON public.attempts FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.sessions s
  WHERE ((s.id = attempts.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid)) AND (s.finished_at IS NULL))))));

--
-- Name: feedback own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own insert" ON public.feedback FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'new'::text) AND (NOT (EXISTS ( SELECT 1
   FROM unnest(feedback.screenshots) path(path)
  WHERE (path.path !~~ ((( SELECT auth.uid() AS uid))::text || '/%'::text)))))));

--
-- Name: flashcard_progress own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own insert" ON public.flashcard_progress FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

--
-- Name: sessions own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own insert" ON public.sessions FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

--
-- Name: flashcards own or admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin delete" ON public.flashcards FOR DELETE TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: flashcards own or admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin insert" ON public.flashcards FOR INSERT TO authenticated WITH CHECK ((((owner_id = ( SELECT auth.uid() AS uid)) AND (origin = 'student'::text)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: attempts own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin read" ON public.attempts FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: feedback own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin read" ON public.feedback FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: flashcard_reviews own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin read" ON public.flashcard_reviews FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: profiles own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin read" ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: sessions own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin read" ON public.sessions FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: flashcards own or admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin update" ON public.flashcards FOR UPDATE TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin))) WITH CHECK ((((owner_id = ( SELECT auth.uid() AS uid)) AND (origin = 'student'::text)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: flashcard_progress own read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own read" ON public.flashcard_progress FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

--
-- Name: flashcard_reviews own self-rated insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own self-rated insert" ON public.flashcard_reviews FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (source = 'self'::text)));

--
-- Name: flashcard_progress own update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own update" ON public.flashcard_progress FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

--
-- Name: profiles own update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own update" ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

--
-- Name: attempts own update before marking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own update before marking" ON public.attempts FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['pending'::text, 'transcribed'::text])))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['pending'::text, 'transcribed'::text]))));

--
-- Name: sessions own update while open; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own update while open" ON public.sessions FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (finished_at IS NULL))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (finished_at IS NULL)));

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

--
-- Name: legacy_paper_sessions readable with its session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "readable with its session" ON public.legacy_paper_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sessions s
  WHERE (s.id = legacy_paper_sessions.session_id))));

--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcards shared live, own or admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "shared live, own or admin read" ON public.flashcards FOR SELECT TO authenticated USING ((((owner_id IS NULL) AND (status = 'live'::text)) OR (owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

--
-- Name: topics signed-in read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "signed-in read" ON public.topics FOR SELECT TO authenticated USING (true);

--
-- Name: attempts submitted single answers are locked; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "submitted single answers are locked" ON public.attempts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT (EXISTS ( SELECT 1
   FROM public.sessions s
  WHERE ((s.id = attempts.session_id) AND (s.kind = 'single'::text) AND (s.finished_at IS NOT NULL)))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM public.sessions s
  WHERE ((s.id = attempts.session_id) AND (s.kind = 'single'::text) AND (s.finished_at IS NOT NULL))))));

--
-- Name: topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

--
-- Name: unpublished_paper_question_readers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unpublished_paper_question_readers ENABLE ROW LEVEL SECURITY;

--
-- Name: unpublished_paper_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unpublished_paper_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_reviews valid self review association; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "valid self review association" ON public.flashcard_reviews AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sessions s
  WHERE ((s.id = flashcard_reviews.session_id) AND (s.user_id = ( SELECT auth.uid() AS uid)) AND (s.kind = 'flashcards'::text) AND (s.finished_at IS NULL) AND ((s.config ->> 'mode'::text) = ANY (ARRAY['study'::text, 'test'::text])) AND (jsonb_typeof((s.config -> 'card_ids'::text)) = 'array'::text) AND ((s.config -> 'card_ids'::text) ? flashcard_reviews.flashcard_id)))));

--
--


-- Objects outside public.
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
create policy "answers own delete" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'answers'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "answers own insert" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'answers'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "answers own read" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'answers'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT is_admin() AS is_admin))));
create policy "question images admin delete" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'question-images'::text) AND ( SELECT is_admin() AS is_admin)));
create policy "question images admin insert" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'question-images'::text) AND ( SELECT is_admin() AS is_admin)));
create policy "reports own delete" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "reports own insert" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "reports own read" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'reports'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR ( SELECT is_admin() AS is_admin))));

-- Exact privileges (independent of the platform's default privileges).
revoke all on function activity_days(uuid,date,date) from public, anon, authenticated, service_role;
grant EXECUTE on function activity_days(uuid,date,date) to authenticated;
grant EXECUTE on function activity_days(uuid,date,date) to service_role;
revoke all on function activity_stats(jsonb,jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function activity_stats(jsonb,jsonb) to authenticated;
grant EXECUTE on function activity_stats(jsonb,jsonb) to service_role;
revoke all on function activity_streaks(uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function activity_streaks(uuid) to authenticated;
grant EXECUTE on function activity_streaks(uuid) to service_role;
revoke all on function admin_dashboard() from public, anon, authenticated, service_role;
grant EXECUTE on function admin_dashboard() to authenticated;
grant EXECUTE on function admin_dashboard() to service_role;
revoke all on function admin_delete_question(text) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_delete_question(text) to authenticated;
grant EXECUTE on function admin_delete_question(text) to service_role;
revoke all on function admin_dispute_history(uuid[]) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_dispute_history(uuid[]) to authenticated;
grant EXECUTE on function admin_dispute_history(uuid[]) to service_role;
revoke all on function admin_flashcard_rows() from public, anon, authenticated, service_role;
grant EXECUTE on function admin_flashcard_rows() to authenticated;
grant EXECUTE on function admin_flashcard_rows() to service_role;
revoke all on function admin_open_student_review(uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_open_student_review(uuid) to authenticated;
grant EXECUTE on function admin_open_student_review(uuid) to service_role;
revoke all on function admin_question_stats(text[],boolean) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_question_stats(text[],boolean) to authenticated;
grant EXECUTE on function admin_question_stats(text[],boolean) to service_role;
revoke all on function admin_reserve_test_mark() from public, anon, authenticated, service_role;
grant EXECUTE on function admin_reserve_test_mark() to authenticated;
grant EXECUTE on function admin_reserve_test_mark() to service_role;
revoke all on function admin_save_question(jsonb,timestamp with time zone) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_save_question(jsonb,timestamp with time zone) to authenticated;
grant EXECUTE on function admin_save_question(jsonb,timestamp with time zone) to service_role;
revoke all on function admin_student_attempts(uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_student_attempts(uuid) to authenticated;
grant EXECUTE on function admin_student_attempts(uuid) to service_role;
revoke all on function admin_student_detail(uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_student_detail(uuid) to authenticated;
grant EXECUTE on function admin_student_detail(uuid) to service_role;
revoke all on function admin_student_rows() from public, anon, authenticated, service_role;
grant EXECUTE on function admin_student_rows() to authenticated;
grant EXECUTE on function admin_student_rows() to service_role;
revoke all on function admin_student_topics(uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function admin_student_topics(uuid) to authenticated;
grant EXECUTE on function admin_student_topics(uuid) to service_role;
revoke all on function ai_spend() from public, anon, authenticated, service_role;
grant EXECUTE on function ai_spend() to service_role;
revoke all on function ai_spend_for_prefixes(text[]) from public, anon, authenticated, service_role;
grant EXECUTE on function ai_spend_for_prefixes(text[]) to service_role;
revoke all on function attempts_question_required() from public, anon, authenticated, service_role;
grant EXECUTE on function attempts_question_required() to service_role;
revoke all on function bump_answer_version() from public, anon, authenticated, service_role;
grant EXECUTE on function bump_answer_version() to service_role;
revoke all on function dedupe_norm(text) from public, anon, authenticated, service_role;
grant EXECUTE on function dedupe_norm(text) to anon;
grant EXECUTE on function dedupe_norm(text) to authenticated;
grant EXECUTE on function dedupe_norm(text) to public;
grant EXECUTE on function dedupe_norm(text) to service_role;
revoke all on function finish_versioned_session(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function finish_versioned_session(uuid,jsonb,jsonb) to service_role;
revoke all on function guard_review_answer_version() from public, anon, authenticated, service_role;
grant EXECUTE on function guard_review_answer_version() to service_role;
revoke all on function handle_new_user() from public, anon, authenticated, service_role;
grant EXECUTE on function handle_new_user() to service_role;
revoke all on function is_admin() from public, anon, authenticated, service_role;
grant EXECUTE on function is_admin() to anon;
grant EXECUTE on function is_admin() to authenticated;
grant EXECUTE on function is_admin() to public;
grant EXECUTE on function is_admin() to service_role;
revoke all on function marking_examples_split_fixed() from public, anon, authenticated, service_role;
grant EXECUTE on function marking_examples_split_fixed() to service_role;
revoke all on function question_import_review(double precision,jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function question_import_review(double precision,jsonb) to service_role;
revoke all on function request_mark_review(uuid,text) from public, anon, authenticated, service_role;
grant EXECUTE on function request_mark_review(uuid,text) to authenticated;
grant EXECUTE on function request_mark_review(uuid,text) to service_role;
revoke all on function save_sprint_answer(uuid,uuid,integer,text,jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function save_sprint_answer(uuid,uuid,integer,text,jsonb) to service_role;
revoke all on function session_review(uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function session_review(uuid) to authenticated;
grant EXECUTE on function session_review(uuid) to service_role;
revoke all on function sprint_pool(jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function sprint_pool(jsonb) to authenticated;
grant EXECUTE on function sprint_pool(jsonb) to service_role;
revoke all on function sprint_questions(jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function sprint_questions(jsonb) to authenticated;
grant EXECUTE on function sprint_questions(jsonb) to service_role;
revoke all on function start_sprint(jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function start_sprint(jsonb) to authenticated;
grant EXECUTE on function start_sprint(jsonb) to service_role;
revoke all on function student_progress(date,date) from public, anon, authenticated, service_role;
grant EXECUTE on function student_progress(date,date) to authenticated;
grant EXECUTE on function student_progress(date,date) to service_role;
revoke all on sequence ai_usage_id_seq from public, anon, authenticated, service_role;
grant SELECT, UPDATE, USAGE on sequence ai_usage_id_seq to anon;
grant SELECT, UPDATE, USAGE on sequence ai_usage_id_seq to authenticated;
grant SELECT, UPDATE, USAGE on sequence ai_usage_id_seq to service_role;
revoke all on table ai_usage from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table ai_usage to service_role;
grant SELECT on table ai_usage to authenticated;
revoke all on table attempts from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table attempts to service_role;
grant SELECT on table attempts to authenticated;
revoke all on table feedback from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table feedback to service_role;
grant SELECT on table feedback to authenticated;
revoke all on table flashcard_progress from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table flashcard_progress to service_role;
grant INSERT, SELECT, UPDATE on table flashcard_progress to authenticated;
revoke all on table flashcard_reviews from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table flashcard_reviews to service_role;
grant SELECT on table flashcard_reviews to authenticated;
revoke all on table flashcards from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table flashcards to service_role;
grant DELETE, INSERT, UPDATE on table flashcards to authenticated;
revoke all on table legacy_paper_sessions from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table legacy_paper_sessions to service_role;
grant SELECT on table legacy_paper_sessions to authenticated;
revoke all on table mark_reviews from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table mark_reviews to service_role;
grant SELECT on table mark_reviews to authenticated;
revoke all on table marking_examples from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table marking_examples to service_role;
grant SELECT on table marking_examples to authenticated;
revoke all on table marking_examples_for_grader from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table marking_examples_for_grader to service_role;
revoke all on table profiles from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table profiles to service_role;
grant SELECT on table profiles to authenticated;
revoke all on table questions from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table questions to service_role;
grant INSERT, UPDATE on table questions to authenticated;
revoke all on table score_history from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table score_history to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE on table score_history to authenticated;
revoke all on table sessions from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table sessions to service_role;
grant SELECT on table sessions to authenticated;
revoke all on table student_mark_reviews from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table student_mark_reviews to service_role;
grant SELECT on table student_mark_reviews to authenticated;
revoke all on table topics from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table topics to service_role;
grant SELECT on table topics to authenticated;
revoke all on table unpublished_paper_question_readers from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table unpublished_paper_question_readers to service_role;
grant SELECT on table unpublished_paper_question_readers to authenticated;
revoke all on table unpublished_paper_questions from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table unpublished_paper_questions to service_role;
revoke all ("position") on table attempts from anon, authenticated, service_role;
revoke all (admin_note) on table feedback from anon, authenticated, service_role;
revoke all (admin_note) on table mark_reviews from anon, authenticated, service_role;
revoke all (answer) on table flashcard_reviews from anon, authenticated, service_role;
revoke all (answer_mode) on table flashcard_reviews from anon, authenticated, service_role;
revoke all (answer_text) on table attempts from anon, authenticated, service_role;
revoke all (back) on table flashcards from anon, authenticated, service_role;
revoke all (choice_index) on table attempts from anon, authenticated, service_role;
revoke all (config) on table sessions from anon, authenticated, service_role;
revoke all (created_at) on table flashcards from anon, authenticated, service_role;
revoke all (dedupe_key) on table flashcards from anon, authenticated, service_role;
revoke all (elapsed_s) on table sessions from anon, authenticated, service_role;
revoke all (final_mark) on table mark_reviews from anon, authenticated, service_role;
revoke all (flagged) on table attempts from anon, authenticated, service_role;
revoke all (flashcard_id) on table feedback from anon, authenticated, service_role;
revoke all (flashcard_id) on table flashcard_reviews from anon, authenticated, service_role;
revoke all (front) on table flashcards from anon, authenticated, service_role;
revoke all (full_name) on table profiles from anon, authenticated, service_role;
revoke all (id) on table flashcards from anon, authenticated, service_role;
revoke all (id) on table questions from anon, authenticated, service_role;
revoke all (image_paths) on table attempts from anon, authenticated, service_role;
revoke all (kind) on table feedback from anon, authenticated, service_role;
revoke all (kind) on table flashcards from anon, authenticated, service_role;
revoke all (kind) on table sessions from anon, authenticated, service_role;
revoke all (mark) on table flashcard_reviews from anon, authenticated, service_role;
revoke all (marks) on table questions from anon, authenticated, service_role;
revoke all (message) on table feedback from anon, authenticated, service_role;
revoke all (options) on table questions from anon, authenticated, service_role;
revoke all (origin) on table questions from anon, authenticated, service_role;
revoke all (owner_id) on table flashcards from anon, authenticated, service_role;
revoke all (page_path) on table feedback from anon, authenticated, service_role;
revoke all (question_id) on table attempts from anon, authenticated, service_role;
revoke all (question_id) on table feedback from anon, authenticated, service_role;
revoke all (resolved_at) on table feedback from anon, authenticated, service_role;
revoke all (resolved_at) on table mark_reviews from anon, authenticated, service_role;
revoke all (resolved_by) on table mark_reviews from anon, authenticated, service_role;
revoke all (school) on table profiles from anon, authenticated, service_role;
revoke all (screenshots) on table feedback from anon, authenticated, service_role;
revoke all (session_id) on table attempts from anon, authenticated, service_role;
revoke all (session_id) on table feedback from anon, authenticated, service_role;
revoke all (session_id) on table flashcard_reviews from anon, authenticated, service_role;
revoke all (source) on table flashcard_reviews from anon, authenticated, service_role;
revoke all (source) on table questions from anon, authenticated, service_role;
revoke all (status) on table feedback from anon, authenticated, service_role;
revoke all (status) on table flashcards from anon, authenticated, service_role;
revoke all (status) on table mark_reviews from anon, authenticated, service_role;
revoke all (status) on table questions from anon, authenticated, service_role;
revoke all (stem) on table questions from anon, authenticated, service_role;
revoke all (stimulus) on table questions from anon, authenticated, service_role;
revoke all (topic_id) on table flashcards from anon, authenticated, service_role;
revoke all (topic_id) on table questions from anon, authenticated, service_role;
revoke all (transcript) on table attempts from anon, authenticated, service_role;
revoke all (type) on table questions from anon, authenticated, service_role;
revoke all (updated_at) on table flashcards from anon, authenticated, service_role;
revoke all (user_agent) on table feedback from anon, authenticated, service_role;
revoke all (verb) on table questions from anon, authenticated, service_role;
revoke all (year) on table questions from anon, authenticated, service_role;
revoke all (year_level) on table profiles from anon, authenticated, service_role;
grant INSERT ("position") on table attempts to authenticated;
grant INSERT (answer) on table flashcard_reviews to authenticated;
grant INSERT (answer_mode) on table flashcard_reviews to authenticated;
grant INSERT (answer_text) on table attempts to authenticated;
grant INSERT (choice_index) on table attempts to authenticated;
grant INSERT (config) on table sessions to authenticated;
grant INSERT (flashcard_id) on table feedback to authenticated;
grant INSERT (flashcard_id) on table flashcard_reviews to authenticated;
grant INSERT (image_paths) on table attempts to authenticated;
grant INSERT (kind) on table feedback to authenticated;
grant INSERT (kind) on table sessions to authenticated;
grant INSERT (mark) on table flashcard_reviews to authenticated;
grant INSERT (message) on table feedback to authenticated;
grant INSERT (page_path) on table feedback to authenticated;
grant INSERT (question_id) on table attempts to authenticated;
grant INSERT (question_id) on table feedback to authenticated;
grant INSERT (screenshots) on table feedback to authenticated;
grant INSERT (session_id) on table attempts to authenticated;
grant INSERT (session_id) on table feedback to authenticated;
grant INSERT (session_id) on table flashcard_reviews to authenticated;
grant INSERT (source) on table flashcard_reviews to authenticated;
grant INSERT (user_agent) on table feedback to authenticated;
grant SELECT (back) on table flashcards to authenticated;
grant SELECT (created_at) on table flashcards to authenticated;
grant SELECT (dedupe_key) on table flashcards to authenticated;
grant SELECT (front) on table flashcards to authenticated;
grant SELECT (id) on table flashcards to authenticated;
grant SELECT (id) on table questions to authenticated;
grant SELECT (kind) on table flashcards to authenticated;
grant SELECT (marks) on table questions to authenticated;
grant SELECT (options) on table questions to authenticated;
grant SELECT (origin) on table questions to authenticated;
grant SELECT (owner_id) on table flashcards to authenticated;
grant SELECT (source) on table questions to authenticated;
grant SELECT (status) on table flashcards to authenticated;
grant SELECT (status) on table questions to authenticated;
grant SELECT (stem) on table questions to authenticated;
grant SELECT (stimulus) on table questions to authenticated;
grant SELECT (topic_id) on table flashcards to authenticated;
grant SELECT (topic_id) on table questions to authenticated;
grant SELECT (type) on table questions to authenticated;
grant SELECT (updated_at) on table flashcards to authenticated;
grant SELECT (verb) on table questions to authenticated;
grant SELECT (year) on table questions to authenticated;
grant UPDATE (admin_note) on table feedback to authenticated;
grant UPDATE (admin_note) on table mark_reviews to authenticated;
grant UPDATE (answer_text) on table attempts to authenticated;
grant UPDATE (choice_index) on table attempts to authenticated;
grant UPDATE (elapsed_s) on table sessions to authenticated;
grant UPDATE (final_mark) on table mark_reviews to authenticated;
grant UPDATE (flagged) on table attempts to authenticated;
grant UPDATE (full_name) on table profiles to authenticated;
grant UPDATE (image_paths) on table attempts to authenticated;
grant UPDATE (resolved_at) on table feedback to authenticated;
grant UPDATE (resolved_at) on table mark_reviews to authenticated;
grant UPDATE (resolved_by) on table mark_reviews to authenticated;
grant UPDATE (school) on table profiles to authenticated;
grant UPDATE (status) on table feedback to authenticated;
grant UPDATE (status) on table mark_reviews to authenticated;
grant UPDATE (transcript) on table attempts to authenticated;
grant UPDATE (year_level) on table profiles to authenticated;

-- Schema and default privileges set by the migrations (verbatim), so later objects get the same grants on fresh installs.
grant usage on schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Platform-created function (Supabase ensure_rls event trigger), absent on the stub: same conditional revoke as 0070.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- Rows inserted by migrations.

INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t1', NULL, 'The Global Economy', 1);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t2', NULL, 'Australia''s Place in the Global Economy', 2);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3', NULL, 'Economic Issues', 3);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4', NULL, 'Economic Policies and Management', 4);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t1-integration', 't1', 'International economic integration', 1);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t1-trade', 't1', 'Trade, financial flows and foreign investment', 2);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t1-protection', 't1', 'Protection', 3);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t1-development', 't1', 'Globalisation and economic development', 4);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t1-case-study', 't1', 'Case study: globalisation and an economy other than Australia', 5);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t2-trade-flows', 't2', 'Australia''s trade and financial flows', 1);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t2-bop', 't2', 'Australia''s Balance of Payments', 2);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t2-exchange-rates', 't2', 'Exchange rates', 3);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t2-free-trade', 't2', 'Free trade and protection', 4);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3-growth', 't3', 'Economic growth', 1);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3-unemployment', 't3', 'Unemployment', 2);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3-inflation', 't3', 'Inflation', 3);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3-external-stability', 't3', 'External stability', 4);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3-distribution', 't3', 'Distribution of income and wealth', 5);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t3-environment', 't3', 'Environmental sustainability', 6);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-objectives', 't4', 'Economic objectives', 1);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-fiscal', 't4', 'Fiscal policy', 2);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-monetary', 't4', 'Monetary policy', 3);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-micro', 't4', 'Microeconomic policies', 4);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-labour', 't4', 'Labour market policies', 5);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-environment', 't4', 'National and global context for environmental management', 6);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-limitations', 't4', 'Limitations of economic policies', 7);
INSERT INTO public.topics (id, parent_id, name, sort) VALUES ('t4-responses', 't4', 'Policy responses and their effects', 8);

INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ge-4', 'short', 't1-integration', 5, 'Assess the impact of international organisations on the global economy.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Comprehensive judgement integrating examples and analysis from multiple organisations"}, {"max": 4, "min": 4, "descriptor": "Sound explanation with some analysis and limited judgement"}, {"max": 3, "min": 3, "descriptor": "Demonstrates some understanding with partial analysis"}, {"max": 2, "min": 2, "descriptor": "Sketches or lists impacts"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'The WTO and IMF have significant positive and negative impacts. The WTO reduces trade barriers, encouraging specialisation and trade — global trade reached $32.2 trillion in 2024. However, the DOHA round''s failure shows limits in protecting developing nations. The IMF provides emergency loans stabilising BOP crises, seen in its $58 billion rescue package to South Korea during the AFC. However, conditional loans requiring structural reforms can worsen inequality — Greece''s GDP contracted ~25% under IMF conditions. Overall, international organisations prevent systemic collapse but their policy prescriptions often prioritise stability over social development.', 'A1 ge-4', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ge-4', NULL, 'Assess', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ge-1', 'short', 't1-integration', 2, 'Distinguish between a trading bloc and a monetary union.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Clearly distinguishes both concepts using correct terminology and an example"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information, may describe only one concept or confuse definitions"}]', NULL, 'A trading bloc is a formal preferential trading arrangement between countries, such as NAFTA. A monetary union goes further by adopting a shared currency and monetary policy, such as the Eurozone. The key distinction is currency: trading blocs retain national currencies while monetary unions adopt a common one.', 'A1 ge-1', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ge-1', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ep-1', 'short', 't1-case-study', 3, 'Explain ONE strategy used to promote environmental sustainability in an economy other than Australia.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Clear explanation of one strategy with example, linking to environmental sustainability"}, {"max": 2, "min": 2, "descriptor": "Sketches one strategy with limited detail"}, {"max": 1, "min": 1, "descriptor": "Some relevant information, vague or inaccurate"}]', NULL, 'China implemented the National Renewable Energy Plan, investing in solar, wind, and hydro power. Environmental sustainability means using resources to meet current needs without compromising intergenerational equity. China became the world''s largest solar panel producer — over 75% of global production in 2023 — expanding renewable capacity to reduce coal dependence. This reduces greenhouse gas emissions and air pollution, improving long-term environmental quality while meeting energy demands sustainably.', 'A1 ep-1', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ep-1', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ge-5', 'short', 't2-trade-flows', 4, 'Discuss TWO changes in the composition and direction of Australia''s trade flows.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Discusses two clear changes with reference to both composition and direction, supported by examples or data"}, {"max": 3, "min": 3, "descriptor": "Discusses changes with some examples but limited depth"}, {"max": 2, "min": 2, "descriptor": "Sketches changes in general terms"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'Composition: historically exports were dominated by agriculture (wool, wheat). Today they are resource-based — iron ore, coal, and LNG account for the majority, with mineral exports valued at A$415 billion in 2023-24 and iron ore alone contributing ~22% of export revenue. Direction: before the 1970s Australia traded primarily with the UK and Europe due to colonial ties. Trade has since shifted strongly to Asia — China (32%), Japan (16%), and South Korea (7%) now account for over 80% of exports, driven by Asian industrialisation and demand for resources.', 'A1 ge-5', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ge-5', NULL, 'Discuss', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ge-2', 'short', 't2-bop', 2, 'Distinguish between the capital account and the financial account.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Clearly distinguishes both accounts with correct terminology/examples"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information, incomplete or unclear distinction"}]', NULL, 'The capital account records the purchase and sale of intellectual property and capital transfers (non-financial assets). The financial account records the purchase and sale of financial investments, loans and borrowings. While both are reversible, the capital account deals with small non-financial transfers, whereas the financial account captures substantial investment and borrowing flows.', 'A1 ge-2', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ge-2', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ge-3', 'short', 't2-exchange-rates', 4, 'Explain how an appreciation of the Australian dollar could influence the balance on goods and services.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Sound explanation linking appreciation to both exports and imports, showing clear impact on BOGS"}, {"max": 3, "min": 3, "descriptor": "Provides some explanation of effects, but lacks full causal link"}, {"max": 2, "min": 2, "descriptor": "Sketches in general terms the effect of appreciation on trade"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'An appreciation increases the value of the AUD against other currencies. In the short term, an appreciation can improve the BOGS through the inverse J-curve: import contracts are locked in so the same import volume costs less (lower M), while export contracts remain inelastic so X is unchanged, improving X-M. However in the long term once contracts expire and the Marshall-Lerner condition applies, more expensive exports lose international competitiveness reducing foreign demand, while Australians substitute to cheaper imports, deteriorating the BOGS.', 'A1 ge-3', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ge-3', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ei-1', 'short', 't3-unemployment', 2, 'Distinguish between cyclical and structural unemployment.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Clearly distinguishes between both types with accurate features/examples"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information but incomplete or unclear distinction"}]', NULL, 'Cyclical unemployment arises during downturns in the business cycle when demand falls and firms reduce labour — during COVID-19 a GDP fall of -6.7% pushed unemployment to 7.5%. Structural unemployment occurs when workers'' skills don''t match industry needs due to technological change or industry shifts, such as after the closure of Australia''s passenger-motor-vehicle industry.', 'A1 ei-1', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ei-1', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ei-2', 'short', 't3-inflation', 2, 'Describe the impact of high inflation on international competitiveness.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Provides a clear description linking inflation to reduced competitiveness"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information, limited link to competitiveness"}]', NULL, 'International competitiveness is the ability of an economy to sell exports relative to others. High inflation raises domestic production costs, leading Australian exporters to increase final prices to maintain profit margins. This makes Australian goods more expensive for foreign buyers, reducing export demand and Australia''s international competitiveness.', 'A1 ei-2', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ei-2', NULL, 'Describe', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ei-3', 'short', 't3-distribution', 4, 'Explain how the dimensions and trends of income inequality affect the Australian economy.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Clear explanation of dimensions AND trends, linked to economic effects with examples"}, {"max": 3, "min": 3, "descriptor": "Explains either dimensions or trends with some link to effects"}, {"max": 2, "min": 2, "descriptor": "Sketches inequality and its effects"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'Income inequality is measured via the Gini coefficient (~0.32 in Australia) and Palma ratio. Dimensions include high-to-low income gaps, gender pay gaps (~13%), and Indigenous disadvantage. Trends show widening inequality due to asset price inflation (housing) and labour market structural change. High inequality reduces aggregate demand as lower-income earners have higher MPC, slowing growth and creating intergenerational poverty. Government redistribution via progressive tax and welfare transfers (JobSeeker, Family Tax Benefit) reduces the post-tax Gini, partially mitigating these effects.', 'A1 ei-3', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ei-3', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ep-3', 'short', 't3-environment', 4, 'Explain how a carbon tax can correct the market failure of negative externalities from production.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Sound explanation linking carbon tax to internalising externalities, referencing MSC/MPC and market failure"}, {"max": 3, "min": 3, "descriptor": "Explains the concept with some link to market failure but missing depth"}, {"max": 2, "min": 2, "descriptor": "Sketches in general terms"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'Negative externalities from production arise when marginal social cost (MSC) exceeds marginal private cost (MPC), leading to overproduction — market failure. Coal-fired electricity generates carbon emissions imposing costs on third parties (climate change, health) not reflected in market prices. A carbon tax equal to the marginal external cost shifts the supply curve left, raising the market price and reducing quantity produced, aligning private cost with social cost and achieving allocative efficiency. Australia''s Carbon Pricing Mechanism (2012-14) priced carbon at A$23/tonne, producing a 1.4% reduction in electricity sector emissions before repeal.', 'A1 ep-3', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ep-3', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ei-5', 'short', 't4-objectives', 2, 'Outline a potential conflict between macroeconomic objectives.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Clearly outlines a conflict between two objectives with definitions"}, {"max": 1, "min": 1, "descriptor": "Outlines one objective or provides some relevant information"}]', NULL, 'A conflict exists between full employment (4-5% unemployment) and price stability (2-3% inflation). When unemployment falls due to higher demand, firms face higher wage costs leading to demand-pull and cost-push inflation. Conversely, contractionary policies to lower inflation typically increase unemployment.', 'A1 ei-5', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ei-5', NULL, 'Outline', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ei-4', 'short', 't4-objectives', 6, 'Analyse the conflicts for government that may arise in pursuing Australia''s economic objectives. Refer to THREE separate objectives.', NULL, NULL, NULL, '[{"max": 6, "min": 6, "descriptor": "Comprehensive analysis of conflicts between THREE economic objectives with clear examples and trade-offs"}, {"max": 5, "min": 5, "descriptor": "Sound analysis covering three objectives with minor gaps"}, {"max": 4, "min": 4, "descriptor": "Explains conflicts with reasonable understanding but limited depth"}, {"max": 3, "min": 3, "descriptor": "Basic explanation; may only properly cover two objectives"}, {"max": 2, "min": 2, "descriptor": "Generalised statements with minimal analysis"}, {"max": 1, "min": 1, "descriptor": "Some relevant information; vague or inaccurate"}]', NULL, 'Conflict 1 — Full employment vs price stability: when unemployment falls, higher wage costs cause demand-pull and cost-push inflation. The RBA''s hikes from 0.10% to 4.35% (2022-23) tackled inflation but pushed unemployment from 3.5% to 4.1%. Conflict 2 — Growth vs environmental sustainability: higher GDP relies on emissions-intensive industries; Australia''s A$66 billion in coal exports (2023) contradicts net-zero commitments. Conflict 3 — Growth vs equity: rapid growth disproportionately benefits capital owners, widening the wealth gap. Asset price inflation has decimated housing affordability while CEO salaries grew 25× faster than median wages. Government must balance these through a coordinated policy mix.', 'A1 ei-4', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ei-4', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-fm-2', 'short', 't4-fiscal', 4, 'Explain the crowding-out effect and its implications for fiscal policy.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Clear explanation with link to fiscal policy implications and loanable funds"}, {"max": 3, "min": 3, "descriptor": "Sound explanation missing some causal link or implications"}, {"max": 2, "min": 2, "descriptor": "Sketches the concept in general terms"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'The crowding-out effect is the decrease in private investment caused by higher interest rates from increased government borrowing. When the government runs a deficit financed through debt, it competes with private borrowers in the loanable funds market, shifting demand for funds right and raising the real interest rate. Higher borrowing costs reduce private investment (I) in AD = C+I+G+X-M. This partially offsets expansionary fiscal policy''s multiplier effect. Post-COVID, Australian government debt exceeding A$900 billion raised crowding-out concerns, though initially mitigated by historically low interest rates.', 'A1 fm-2', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'fm-2', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-fm-4', 'short', 't4-fiscal', 2, 'Distinguish between automatic stabilisers and discretionary fiscal policy.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Clearly distinguishes both with correct terminology and examples"}, {"max": 1, "min": 1, "descriptor": "Some relevant information, may describe only one concept"}]', NULL, 'Automatic stabilisers are non-discretionary budget components that respond automatically to the business cycle — progressive income tax falls in downturns and unemployment benefits rise, providing stimulus without government action. Discretionary fiscal policy involves deliberate decisions to change spending or taxation, such as the $90 billion JobKeeper program during COVID-19. The key distinction is that automatic stabilisers operate without policy lag, while discretionary policy requires legislative approval and faces implementation delays.', 'A1 fm-4', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'fm-4', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-fm-5', 'short', 't4-fiscal', 4, 'Explain the effects of an expansionary fiscal stance on the Australian economy.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Sound explanation with effects on AD, employment, and growth using examples"}, {"max": 3, "min": 3, "descriptor": "Explains effects with some examples but limited depth"}, {"max": 2, "min": 2, "descriptor": "General explanation of expansionary fiscal policy"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'An expansionary fiscal stance involves increased government spending and/or tax cuts, typically running a budget deficit to stimulate AD = C+I+G+X-M. During COVID-19, Australia deployed A$311 billion in stimulus (JobKeeper, HomeBuilder, JobSeeker). Higher G raised AD directly; tax cuts boosted disposable income (C). The multiplier effect (k=1/(1-MPC)) amplified the initial injection, helping GDP recover from -6.7% to +4.5% by 2021 and reducing unemployment from 7.5% to 3.5% by 2023. However, it caused government debt to exceed A$900 billion and contributed to inflation peaking at 7.8% in 2022.', 'A1 fm-5', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'fm-5', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-fm-1', 'short', 't4-limitations', 3, 'Compare the limitations of fiscal policy relative to monetary policy.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Compares key limitations of both policy types using examples"}, {"max": 2, "min": 2, "descriptor": "Identifies some limitations with limited comparison"}, {"max": 1, "min": 1, "descriptor": "Minimal/vague explanation"}]', NULL, 'Fiscal policy faces longer implementation and political lags because budget measures require parliamentary approval and are subject to election cycles. Monetary policy is set by the independent RBA without political negotiation — it raised the cash rate from 0.10% to 4.35% in 2022-23 responding rapidly to inflation. Fiscal policy is also a blunter tool affecting the whole economy, while monetary policy can act more precisely and quickly through the cash market.', 'A1 fm-1', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'fm-1', NULL, 'Compare', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-mp-2', 'short', 't4-micro', 3, 'Explain the structural changes that occur as a result of microeconomic policies in the Australian economy.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Clear explanation of how microeconomic policies drive structural change with example"}, {"max": 2, "min": 2, "descriptor": "General explanation with limited detail/example"}, {"max": 1, "min": 1, "descriptor": "Some relevant information, little link to structural change"}]', NULL, 'Structural change refers to long-term shifts in patterns of consumption and production. Microeconomic policies improve efficiency, productivity and competitiveness to increase aggregate supply. In Australia, tariff reductions, privatisation, and deregulation reallocated resources toward more competitive industries while less efficient ones declined. This produced the decline of manufacturing, PMV, and TCF industries as employers, and the growth of mining, services, and high-skilled industries — reflecting a more efficient, internationally competitive economy.', 'A1 mp-2', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'mp-2', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-mp-4', 'short', 't4-labour', 3, 'Distinguish between centralised and decentralised wage determination.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Clearly distinguishes both systems with examples and key features"}, {"max": 2, "min": 2, "descriptor": "General distinction with limited detail"}, {"max": 1, "min": 1, "descriptor": "Some relevant information, unclear distinction"}]', NULL, 'Centralised wage determination sets wages uniformly through a central authority, such as industry-wide awards or national wage cases determined by the Fair Work Commission — Australia''s dominant system pre-1990s. Decentralised wage determination sets wages at the enterprise or individual level through enterprise bargaining agreements (EBAs) or individual contracts, covering most Australian workers today. The key distinction is the level of negotiation: centralised systems prioritise equity and consistency, while decentralised systems link wages to firm-level productivity allowing greater flexibility but potentially widening wage dispersion.', 'A1 mp-4', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'mp-4', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ep-5', 'short', 't4-environment', 5, 'Discuss the role of international agreements in shaping Australia''s environmental policy.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Comprehensive discussion referencing specific agreements, their influence, and limitations"}, {"max": 4, "min": 4, "descriptor": "Sound discussion with examples but limited evaluation"}, {"max": 3, "min": 3, "descriptor": "Explains the role with limited examples"}, {"max": 2, "min": 2, "descriptor": "General statements about agreements"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'The Paris Agreement (2015) significantly shaped Australia''s environmental policy by committing Australia to reduce emissions 43% below 2005 levels by 2030 and reach net-zero by 2050. This drove the Safeguard Mechanism (covering 215 large industrial emitters), A$20 billion Rewiring the Nation investment, and A$2 billion Hydrogen Headstart program. EU CBAM carbon border adjustments create economic pressure for Australian exporters to decarbonise. However, the non-binding nature of commitments and political instability — Australia withdrew from earlier targets — limits effectiveness. Global free riders (China, India) also reduce the global impact. International agreements provide direction, but domestic political will ultimately determines outcomes.', 'A1 ep-5', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ep-5', NULL, 'Discuss', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-22c', 'short', 't2-free-trade', 5, 'Discuss the impact of free trade agreements on the quality of life in Australia.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive discussion of the positive and negative impacts of free trade on the quality of life in Australia"}, {"max": 4, "min": 4, "descriptor": "Provides a sound discussion of the positive and negative impacts of free trade on the quality of life in Australia"}, {"max": 3, "min": 3, "descriptor": "Provides some discussion of the positive and/or negative impacts of free trade on the quality of life in Australia"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of free trade and/or quality of life"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Free trade refers to the removal of trade barriers such as tariffs, quotas, and subsidies
between economies, allowing goods, services and factors of production to move without
government-imposed restrictions. Free trade has had both positive and negative
implications on quality of life in Australia. One key advantage is increased choice and lower
prices for consumers. This is because the removal of tariffs allows domestic consumers to
access foreign goods without the added cost of import duties, lowering the price of
imported goods and increasing real purchasing power. This is evident through the
China-Australia Free Trade Agreement (ChAFTA, 2015), which reduced tariff duties collected
on Chinese imports from $1,141 million in 2015 to just $118 million by 2019, an 89.7%
decrease, saving Australian importers and consumers an estimated average of $940 million
annually. Additionally, free trade has boosted export opportunities. This is because the
elimination of foreign tariffs allows Australian exporters to sell goods and services more
competitively in overseas markets, increasing export revenue and supporting employment

in export-oriented industries. This is evident through the Comprehensive and Progressive
Agreement for Trans-Pacific Partnership (CPTPP, 2018), which eliminated over 98% of tariffs
among its 12 member countries, expanding market access for Australian exporters across
resources, agriculture and services sectors. However, one key disadvantage is the negative
impact on domestic industries exposed to import competition. This is because cheaper
imports place downward pressure on the prices and market share of domestically produced
goods, forcing uncompetitive firms to reduce output or close, leading to job losses. This is
evident through Australia''s textile, clothing and footwear (TCF) manufacturing sector, where
employment fell from around 73,000 workers in 2002 to just 34,000 by 2022, reducing
quality of life for displaced workers and their communities. Additionally, a second
disadvantage is increased income inequality between skilled and unskilled workers. This is
because free trade favours industries that use Australia''s comparative advantage in
high-skill and capital-intensive production, such as mining and finance, while placing
greater pressure on low-skill, labour-intensive industries most exposed to import
competition. This is evident through the growing wage gap between Australia''s resources
and finance sectors, which recorded some of the nation''s highest average full-time
earnings, and lower-skill manufacturing roles, which have faced stagnant wage growth and
declining job security, worsening quality of life for lower-skilled households relative to
higher-skilled ones.', 'A1 HSC Mock Exam 2 Q22(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-22c', NULL, 'Discuss', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-ep-4', 'short', 't4-environment', 3, 'Outline TWO limitations to the effectiveness of Australia''s environmental policies.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Outlines two clear limitations with examples or context"}, {"max": 2, "min": 2, "descriptor": "Outlines one limitation in detail or two with limited detail"}, {"max": 1, "min": 1, "descriptor": "Some relevant information"}]', NULL, 'First, global free riders and carbon leakage: even if Australia reduces emissions, production may shift to countries without emissions costs. Australia''s 1.1% share of global emissions also limits the global impact of unilateral action. Second, political instability and policy reversals: the Carbon Pricing Mechanism was repealed in 2014 after just two years despite reducing electricity sector emissions by 1.4%, creating business uncertainty and undermining long-term investment in low-emissions technology.', 'A1 ep-4', 2026, '2026-10-20 12:57:27.233528+11', 'a1', 'ep-4', NULL, 'Outline', 'retired', NULL, '2026-10-20 12:57:27.233528+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-21a', 'short', 't1-protection', 2, 'Outline local content rules as a form of protection.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Outlines local content rules as a method of protection"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Local content rules refer to government policies, where a certain percentage of inputs or outputs must be manufactured domestically. One key feature is that they act as a non-tariff barrier, artificially diverting demand towards domestic producers by legally requiring a set percentage of local content in production, without directly taxing or limiting the quantity of imports as a tariff or quota would.', 'A1 HSC Mock Exam 2 Q21(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-21a', NULL, 'Outline', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-21b', 'short', 't1-case-study', 3, 'With reference to an economy other than Australia, explain how globalisation has impacted environmental sustainability.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains how globalisation has impacted environmental sustainability, with reference to an economy other than Australia"}, {"max": 2, "min": 2, "descriptor": "Describes how globalisation has impacted environmental sustainability, with reference to an economy other than Australia"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Country chosen: China
Globalisation is the increased integration of individual economies on the basis of trade, finance, investment, technology, and labour. Since China’s Open Door Policy (1978) and WTO Accession (2001), globalisation has been a key driver of environmental degradation as a result of its integration into global supply chains, attracting significant foreign direct investment into manufacturing This was caused by rapid, export oriented industrialisation, which caused a surge in fossil fuel-based energy consumption, contributing to China becoming the world''s largest emitter of CO₂, accounting for approximately 30% of global carbon emissions by 2023, alongside severe air pollution in industrial hubs such as Beijing and Hebei province.
Note: Students may choose any country for this question - as long as they complete the requirements for the 4 mark criteria, they can earn full marks.', 'A1 HSC Mock Exam 2 Q21(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-21b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-21c', 'short', 't1-development', 5, 'Assess the consequences of an unequal distribution of global income and wealth.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive assessment of the consequences of an unequal distribution of global income and wealth"}, {"max": 4, "min": 4, "descriptor": "Provides a sound assessment of the consequences of an unequal distribution of global income and wealth"}, {"max": 3, "min": 3, "descriptor": "Provides some assessment of the consequences of an unequal distribution of global income and wealth"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of the consequences of an unequal distribution of global income and wealth"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Income and wealth inequality refers to the uneven distribution of income and wealth between individuals or countries, commonly measured via the Gini coefficient. One key consequence of global income inequality is reduced growth. This is because as income is distributed unproportionally to high income earners with a high APS, they tend to save their income rather than consume. As a result, global aggregate demand would fall and reduce GWP. This concept is illustrated effectively via the IMF’s research (2015) that estimates that a 1 percentage point increase in the income share of the top 20% is associated with a 0.08 percentage point reduction in GDP growth over the following five years. Hence, a higher global income gini coefficient will substantially degrade spending and thus economic growth. However, when income and wealth inequality is present, incomes and assets are directed towards a smaller percentage of the population. This will incentivise individuals to improve their education/skills and encourage entrepreneurship. As a result, global labour productivity will significantly rise to boost aggregate supply and hence GWP. Overall, the consequences of global income and wealth inequality have therefore been highly significant, though partially cushioned by ongoing multilateral (World Bank, UN) and government redistributive efforts.', 'A1 HSC Mock Exam 2 Q21(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-21c', NULL, 'Assess', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-22a', 'short', 't2-exchange-rates', 2, 'Distinguish between a fixed and managed exchange rate determination system.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Provides a distinguishing factor between a fixed and managed exchange rate determination system"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'A fixed exchange rate refers to a system where the government or central bank sets and maintains the value of its currency at a predetermined rate, intervening continuously in the foreign exchange market to defend this “hard peg”. Alternately, a managed exchange rate refers to a system where the currency''s value is primarily determined by market forces, but the central bank periodically intervenes to smooth excessive volatility without maintaining a strict peg. The key distinguishing factor is that a fixed rate requires continuous intervention to defend an exact rate, whereas a managed rate only involves occasional, discretionary intervention.', 'A1 HSC Mock Exam 2 Q22(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-22a', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-22b', 'short', 't2-bop', 3, 'Explain ONE structural factor influencing Australia’s Balance of Payments.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains ONE structural factor influencing Australia''s balance of payments"}, {"max": 2, "min": 2, "descriptor": "Outlines ONE structural factor influencing Australia''s balance of payments"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'A structural factor refers to a long-term, persistent characteristic of an economy that influences trends in the Balance of Payments over time. One key structural factor influencing Australia''s BOP is its culture of conspicuous consumption, characterised

by consistently high household spending on discretionary and imported goods. This
was caused by Australians'' entrenched preference for current consumption over
saving, driving persistently low national savings relative to domestic investment
needs. As a result, this savings-investment gap must be financed through foreign
borrowing, as seen through Australia''s consistently negative net primary income
account, as international borrowing generates ongoing interest repayments to foreign
lenders, recorded as a debit in the NPY section of the current account.', 'A1 HSC Mock Exam 2 Q22(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-22b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-23b', 'short', 't3-inflation', 4, 'The global economy experiences an increase in oil prices due to political conflicts. Explain how this may impact the types of inflation within the domestic economy.', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Demonstrates a clear and comprehensive understanding of how the increase in oil prices may impact TWO types of inflation in the domestic economy"}, {"max": 3, "min": 3, "descriptor": "Demonstrates a sound understanding of how the increase in oil prices may impact TWO types of inflation in the domestic economy"}, {"max": 2, "min": 2, "descriptor": "Demonstrates some understanding of how the increase in oil prices may impact type(s) of inflation in the domestic economy"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Cost-push/imported
Underlying
Rising oil prices from political conflict push up production and transport costs across the
economy, since oil is a key input for manufacturing, freight and energy generation. This
directly causes cost-push inflation, as firms facing higher input costs raise prices to
maintain profit margins (passing costs onto consumers). In addition, since oil is imported,
this increase also constitutes imported inflation.
In addition, this supply-side pressure feeds into underlying inflation, since oil is used across
many industries (transport, manufacturing, packaging), meaning the price rises are
broad-based and persistent rather than confined to one volatile item. This is what the RBA''s
trimmed mean/weighted median measures capture, as opposed to headline inflation which
includes volatile items like oil directly.', 'A1 HSC Mock Exam 2 Q23(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-23b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-23c', 'short', 't3-inflation', 5, 'Analyse the effects of high inflation on the Australian economy.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Demonstrates a clear and comprehensive understanding of the effects of inflation on the Australian economy"}, {"max": 4, "min": 4, "descriptor": "Demonstrates a sound understanding of the effects of inflation on the Australian economy"}, {"max": 3, "min": 3, "descriptor": "Demonstrates some understanding of the effects of inflation on the Australian economy"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of inflation and/or the Australian economy"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Inflation refers to a sustained increase in the general level of prices of goods and services
within an economy, typically measured by the Consumer Price Index (CPI). Inflation rose
sharply in Australia following the COVID-19 pandemic. This was caused by the
overexpansion of aggregate demand, driven by unprecedented fiscal and monetary
stimulus injected into the economy to support households and businesses during the
pandemic. This is evident through Australia''s inflation rate, which was pushed to a peak of
7.8% in December 2022, well above the RBA''s 2–3% target band.
One key implication is on individuals, specifically the erosion of real household purchasing
power. This is because rising prices reduce the quantity of goods and services a given level
of income can purchase, particularly when wage growth fails to keep pace. This is evident
through the ABS Wage Price Index, which recorded nominal wage growth of only around
3.3% in the December 2022 quarter, well below the rate of inflation, resulting in a decline in
real wages and a fall in living standards for many Australian households.
This inflationary pressure also generated significant implications for businesses, specifically
rising production and input costs. This is because higher prices for imported materials,
energy and freight increase businesses'' cost of production, which firms often pass on to
consumers through higher prices, further compounding inflationary pressures. This is
evident through rising producer price indices across the construction and manufacturing
sectors during 2022–23, as firms faced higher costs for imported steel, fuel and shipping,
squeezing profit margins and, in some cases, reducing investment and hiring intentions.
At a government level, this necessitated contractionary monetary policy intervention. This is
because persistently high inflation above the target band requires the RBA to raise interest
rates to curb aggregate demand and bring inflation back under control in its target range of

2–3%. This is evident through the RBA progressively raising the cash rate target from 0.1%
in 2022 to 4.35% by November 2023, which slowed consumer borrowing and business
investment, gradually bringing headline inflation back down to around 2.4% by the
December 2024 quarter, though this followed a period of markedly slower economic
growth, with annual GDP growth falling to just 0.8% by the September 2024 quarter as the
RBA''s contractionary stance weighed on consumer spending and investment.', 'A1 HSC Mock Exam 2 Q23(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-23c', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-24a', 'short', 't4-micro', 2, 'Outline the use of regulation and deregulation in Competition Policy.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Outlines the use of regulation and deregulation in competition policy"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Competition policy refers to the set of government laws and measures designed to promote
competitive market structures and prevent anti-competitive conduct within an economy.
One key feature is that competition policy utilises both regulation and deregulation to
stimulate competition. Regulation stimulates competition by prohibiting anti-competitive
conduct such as price-fixing, cartel behaviour, and misuse of market power by dominant
firms, ensuring smaller or new firms can enter and compete on a level playing field without
being unfairly squeezed out. In contrast, deregulation stimulates competition by removing
unnecessary government restrictions, such as licensing requirements or entry barriers, that
previously limited the number of firms able to operate in a market, allowing new entrants to
increase supply and drive down prices through greater market contestability.', 'A1 HSC Mock Exam 2 Q24(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-24a', NULL, 'Outline', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-24b', 'short', 't4-labour', 3, 'Explain ONE policy used to promote labour productivity in the Australian economy.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains ONE policy used to promote labour productivity in the Australian economy"}, {"max": 2, "min": 2, "descriptor": "Outlines ONE policy used to promote labour productivity in the Australian economy"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'A microeconomic policy refers to government measures targeting specific markets or
industries to improve efficiency, productive capacity and international competitiveness. One
key policy used to promote labour productivity in Australia is investment in vocational
education and training, such as the Free TAFE initiative, introduced in 2023. The program
provides fee-free places for students studying accredited diplomas, certificates and short
courses in priority skill areas, including care (aged care, disability care, childcare),
construction, and technology, targeting industries facing significant skills shortages. This is
evident through the Fee-Free TAFE Skills Agreement, under which the Australian
Government has partnered with state and territory governments to deliver $1.5 billion in
funding for over 500,000 Free TAFE and VET places across Australia between 2023 and
2026. As a result, this policy has improved workers'' human capital and skill levels, enabling
a given quantity of labour input to produce a greater level of output, thereby increasing
labour productivity across the Australian economy.', 'A1 HSC Mock Exam 2 Q24(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-24b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m2-24c', 'short', 't4-labour', 5, 'Compare the use of centralised and decentralised wage determination systems in the Australian economy.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive comparison of the similarities and differences between centralised and decentralised wage determination systems"}, {"max": 4, "min": 4, "descriptor": "Provides a sound comparison of the similarities and differences between centralised and decentralised wage determination systems"}, {"max": 3, "min": 3, "descriptor": "Provides some comparison of the similarities and/or differences between centralised and decentralised wage determination systems"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of centralised and/or decentralised wage determination systems"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Centralised wage determination refers to a system where wages are set by a central
authority, such as the Fair Work Commission (FWC), through mechanisms like Modern
Awards and the National Minimum Wage. Decentralised wage determination refers to a
system where wages are negotiated directly between employers and employees or unions
at the workplace level, such as through Enterprise Bargaining Agreements (EBAs). One key
similarity is that both systems operate within Australia''s current wage framework and
remain subject to FWC oversight, which reviews EBAs to ensure they meet the "Better Off
Overall Test" (BOOT). Additionally, both systems aim to balance fairness for workers with
maintaining Australia''s international competitiveness. However, one key difference is that
centralised systems, such as the FWC''s 2024 minimum wage review (raising the National
Minimum Wage by 3.75% to $24.10 per hour), provide a uniform safety net for low-paid
workers, whereas decentralised systems allow wage outcomes to reflect firm-specific
productivity. In contrast, decentralised systems can create greater wage flexibility, evident
in sectors such as mining where EBAs have delivered above-award wages tied to
enterprise-level productivity, whereas centralised systems risk contributing to wage
compression and weaker firm-level productivity incentives.', 'A1 HSC Mock Exam 2 Q24(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm2-24c', NULL, 'Compare', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-21a', 'short', 't1-development', 2, 'Describe one reason for global wealth inequality, using an example.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Describes one reason for global wealth inequality, using an example"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'One reason for global wealth inequality is unequal access to capital which allows specific economies to accumulate assets faster than others. For example, the USA''s developed financial markets enable high savings and investment, channelled into asset ownership (equities, property, businesses) that generate returns, compounding wealth over time. In contrast, Sub Saharan African economies have limited capital access, so income goes largely to consumption rather than asset accumulation. This creates a widening gap in accumulated wealth, not just income, between advanced and developing economies.', 'A1 HSC Mock Exam 3 Q21(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-21a', NULL, 'Describe', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-21b', 'short', 't1-protection', 3, 'Explain how export incentives are used as a form of protection.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains how export incentives are used as a form of protection"}, {"max": 2, "min": 2, "descriptor": "Outlines how export incentives are used as a form of protection"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Export incentives refer to government measures, such as subsidies and tax concessions, designed to encourage increase in exports of goods and services from the domestic economy. Export incentives promote protection by giving domestic firms an artificial competitive advantage, such as lower costs or prices, that foreign firms do not receive. This effectively shields and favours the domestic export industries from genuine international competition, making export incentives a form of indirect protectionism', 'A1 HSC Mock Exam 3 Q21(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-21b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-21c', 'short', 't2-free-trade', 5, 'Explain the effects of domestic and global protection on Australia’s economic growth and quality of life.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive explanation of the effects of domestic and global protection on Australia''s economic growth and quality of life"}, {"max": 4, "min": 4, "descriptor": "Provides a sound explanation of the effects of domestic and global protection on Australia''s economic growth and quality of life"}, {"max": 3, "min": 3, "descriptor": "Provides some explanation of the effects of domestic and/or global protection on Australia''s economic growth and quality of life"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of protection and/or economic growth and quality of life"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Protection refers to the artificial barriers to trade a nation may impose such as tariffs, subsidies and quotas, which affect economic growth and quality of life through changes to incomes, prices and employment.

Domestic protection historically worsened Australia''s economic growth by diverting resources into inefficient sectors like the passenger motor vehicle (PMV) and textile, clothing and footwear (TCF) industries rather than allowing capital and labour to flow into more internationally competitive sectors like mining. PMV tariffs peaked at 57.5 per cent in 1985, sustaining a high-cost manufacturing base that lacked economies of scale and misallocated resources, constraining long-run output growth while raising prices for protected goods and reducing material living standards for consumers. Following liberalisation, PMV tariffs were cut to 5 per cent by 2010, causing firm closures and structural unemployment that harmed non material quality of life in affected regions, but freeing capital and labour for reallocation into more productive, export-oriented sectors like mining and services, improving allocative efficiency, incomes and material living standards over time.

Global protection, such as the US''s 2025 tariffs, has mixed effects on growth and quality of life. While such measures threaten global trade volumes and raise consumer prices, Productivity Commission modelling found Trump''s tariffs could raise Australian GDP by 0.37 per cent, as capital outflow from the US is redirected into open economies like Australia''s, boosting investment, employment and material living standards.', 'A1 HSC Mock Exam 3 Q21(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-21c', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-22b', 'short', 't2-exchange-rates', 3, 'Explain why the TWI provides a more accurate measure of the value of domestic currency rather than a bilateral exchange rate.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains why the TWI provides a more accurate measure of currency value than a bilateral exchange rate"}, {"max": 2, "min": 2, "descriptor": "Outlines why the TWI provides a more accurate measure of currency value than a bilateral exchange rate"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'The Trade-Weighted Index (TWI) measures the value of a currency against a basket of currencies from its major trading partners, weighted according to the two way trade volumes with each country, whilst the bilateral exchange rate measures the value of one currency against a single other currency. The TWI captures overall changes in international competitiveness, since a currency can appreciate against one currency while depreciating against another. In contrast, a bilateral exchange rate only reflects movements against a single currency, making it less representative of a country''s overall trade position, and therefore less reliable than the TWI as an indicator of true currency value.', 'A1 HSC Mock Exam 3 Q22(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-22b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-22c', 'short', 't2-bop', 4, 'Explain recent trends in the composition of Australia''s Balance of Payments', NULL, NULL, NULL, '[{"max": 4, "min": 4, "descriptor": "Provides a comprehensive explanation of trends in the composition of Australia''s Balance of Payments"}, {"max": 3, "min": 3, "descriptor": "Provides a sound explanation of trends in the composition of Australia''s Balance of Payments"}, {"max": 2, "min": 2, "descriptor": "Provides some explanation/description of trends in the composition of Australia''s Balance of Payments"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'One trend for Australia can be seen through a persistent Current Account Deficit which has been driven by low national savings relative to investment, creating a structural savings-investment gap where domestic savings are insufficient to fund required investment. This forces the economy to rely on foreign capital through international borrowing to finance investment growth. This debt increases interest repayments causing interest to be debited through the NPY account of the CA, contributing directly to the nation''s structural CAD.

Additionally, another trend can be seen through Australia''s volatile Balance on Goods and Services (BOGS) caused by its narrow export base. Exports are heavily concentrated in commodities like iron ore and coal, making export revenue highly sensitive to fluctuations in global commodity prices and demand. This causes the trade balance to swing sharply between surplus and deficit with the terms of trade, for example, high commodity prices during a mining boom pushing Australia into surplus, while falling prices or demand reverse this into deficit. This was seen in the BOGS peaking at $41.5bn in 2021, resulting in a CAS of $9.5bn.', 'A1 HSC Mock Exam 3 Q22(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-22c', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-23a', 'short', 't2-bop', 2, 'Distinguish between the capital and financial account.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Provides a distinguishing factor between the capital and financial account"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'The capital account refers to the section of the BOP that records receipts of capital transfers and the transfer of non produced, non financial assets, whereas the financial account records receipts of financial flows related to the transfer of ownership of financial assets and liabilities. The key distinguishing factor is that the capital account records the transfer of non-financial assets, while the financial account records the transfer of financial assets and liabilities.', 'A1 HSC Mock Exam 3 Q23(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-23a', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-23b', 'short', 't3-external-stability', 3, 'Explain the effects of high levels of international borrowing on the Australian economy', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains the effects of high levels of international borrowing on the Australian economy"}, {"max": 2, "min": 2, "descriptor": "Outlines the effects of high levels of international borrowing on the Australian economy"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'High levels of international borrowing have led to Australia recording a net foreign debt position exceeding $1 trillion, reflecting decades of reliance on foreign capital to fund the structural savings investment gap. This borrowing generates ongoing debt servicing costs, primarily interest payments debited through the NPY account, which contribute to Australia''s persistent Current Account Deficit, historically averaging around 3-4 per cent of GDP. While this borrowing has funded investment, particularly in mining and infrastructure, it also increases Australia''s vulnerability to global interest rate rises, credit rating downgrades, and exchange rate volatility, raising the cost of future borrowing.', 'A1 HSC Mock Exam 3 Q23(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-23b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-23c', 'short', 't3-external-stability', 5, 'Analyse the causes and effects of recent changes in Australia’s external stability', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive analysis of the causes and effects of recent changes in Australia''s external stability"}, {"max": 4, "min": 4, "descriptor": "Provides a sound analysis of the causes and effects of recent changes in Australia''s external stability"}, {"max": 3, "min": 3, "descriptor": "Provides some analysis of the causes and/or effects of recent changes in Australia''s external stability"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of Australia''s external stability"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Australia''s external stability has recently been affected by volatile terms of trade, driven by its narrow export base (iron ore, coal, gas). Fluctuations in global demand, particularly from China, cause fluctuations in export revenue and the balance of goods and services, thus the CAD as a % of GDP and external stability. Additionally, the persistent savings investment gap continues to drive reliance on foreign capital inflows to fund investment. This leads to a rise in Net Foreign Debt as a % of GDP and an increase in outflows via interest repayments, reducing the NPY balance and thus the CAD as a % of GDP.

These factors have led to more volatility. Higher commodity prices during favourable terms of trade periods can create a smaller CAD or even generate temporary surpluses, while decreases in these prices reverse this into deficit, increasing reliance on foreign borrowing. This volatility can also pressure the exchange rate, affecting international competitiveness through changes in export prices. However, sustained capital inflows have supported investment in productive sectors like mining and infrastructure, contributing to economic growth despite short term external volatility, indicating this instability is more cyclical than structural in nature.', 'A1 HSC Mock Exam 3 Q23(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-23c', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-24a', 'short', 't4-labour', 2, 'Distinguish between minimum wage and the modern award', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Provides a distinguishing factor between minimum wage and the modern award"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'The minimum wage is the base standard of hourly or weekly rate of pay that an employer can legally pay an employee, set annually by the Fair Work Commission. A modern award is a legally binding document that sets out minimum pay rates and employment conditions such as hours, leave or overtime for employees within a specific industry or occupation. The key distinguishing factor is that the minimum wage applies as a single price floor of wages across the entire economy, whereas a modern award sets more detailed, industry or occupation specific minimum pay rates and conditions that sit above the minimum wage.', 'A1 HSC Mock Exam 3 Q24(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-24a', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-24b', 'short', 't4-labour', 2, 'Describe how minimum employment standards influence the supply of labour', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Provides a comprehensive description of how minimum employment standards influence the supply of labour"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Minimum employment standards such as the National Employment Standards (NES) set legal base requirements for conditions like maximum weekly hours, annual leave, and parental leave. By guaranteeing safer, fairer working conditions, these standards can increase labour supply by making work more attractive to groups such as parents or older workers, who may otherwise be discouraged from participating due to poor conditions or job insecurity. For example, provisions like flexible working arrangements and parental leave can encourage higher workforce participation, particularly among women, increasing the aggregate supply of labour.', 'A1 HSC Mock Exam 3 Q24(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-24b', NULL, 'Describe', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-21b', 'short', 't3-inflation', 3, 'Explain how globalisation can reduce inflation in an economy.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains how globalisation can reduce inflation in an economy"}, {"max": 2, "min": 2, "descriptor": "Outlines how globalisation can reduce inflation in an economy"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Globalisation refers to the increased integration of individual economies on the basis of trade, finance, investment & Transnational corporations (TNCs), labour and technology. Globalisation increases access to imports from lower cost producers, especially manufactured goods from emerging economies with lower labour costs. Greater import competition then forces domestic firms to keep their prices down to ensure market share, which creates lower prices domestically and lower imported inflation. At the same time, cheaper imported intermediate goods sourced through global supply chains lower firms'' costs of production, which reduces cost-push inflation.', 'A1 HSC Mock Exam 5 Q21(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-21b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m3-24c', 'short', 't4-labour', 6, 'Assess the effectiveness of labour market policies in achieving full employment within the Australian economy', NULL, NULL, NULL, '[{"max": 6, "min": 6, "descriptor": "Provides a comprehensive assessment of the effectiveness of labour market policies in achieving full employment, using TWO relevant policies"}, {"max": 5, "min": 5, "descriptor": "Provides a sound assessment of the effectiveness of labour market policies in achieving full employment, using TWO relevant policies"}, {"max": 4, "min": 4, "descriptor": "Provides some assessment of the effectiveness of labour market policies in achieving full employment"}, {"max": 3, "min": 3, "descriptor": "Provides some explanation of labour market policies and/or full employment"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of labour market policies and/or full employment"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Australia''s labour market policies have been moderately effective in promoting full employment, however has had key limitations in partially addressing structural issues. This can be seen through Wage subsidies for example, under Workforce Australia. These were introduced to reduce structural (mismatch of skills of labour and requirements of the economy) and long term unemployment (>12 months of u/e) by lowering the cost to firms of hiring disadvantaged workers, offsetting their lower productivity. This has helped move Australia toward full employment, with the unemployment rate sitting at 4.5 per cent in July 2026, as more disadvantaged jobseekers are incentivised into paid work, reducing structural unemployment and improving allocative efficiency in the labour market. However, a key limitation is deadweight loss, where subsidies are paid to firms that would have hired the worker regardless, reducing the policy''s cost effectiveness and limiting its net impact on full employment.

Secondly, Vocational Education and Training (VET) programs have contributed to achieving full employment in Australia. These were introduced to address structural unemployment caused by skills mismatches from technological change and automation. By retraining workers in demand-driven skills, VET improves the quality and adaptability of labour supply, supporting participation, currently at 66.9 per cent, and reducing long-term structural unemployment. However, a key limitation is that retraining is slow acting, meaning it cannot respond quickly to rapid industry change such as changes in artificial intelligence currently, and the underemployment rate (6.4 per cent) suggests many remain underutilised despite retraining efforts, limiting full employment.', 'A1 HSC Mock Exam 3 Q24(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm3-24c', NULL, 'Assess', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-21a', 'short', 't1-integration', 2, 'Distinguish between the role of the IMF and World Bank.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Distinguishes between the role of the IMF and the World Bank"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'The IMF promotes global financial stability by monitoring economies and providing conditional loans to countries facing balance of payments or currency crises, often with structural adjustment conditions. The World Bank promotes long term economic development by providing conditional funding for infrastructure, education and health projects in developing economies. The key distinguishing factor is that the IMF focuses on short term financial stability, whereas the World Bank focuses on long term economic development and poverty reduction.', 'A1 HSC Mock Exam 4 Q21(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-21a', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-21b', 'short', 't3-unemployment', 3, 'Describe the effects of globalisation on Australia’s levels of unemployment.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Describes the effects of globalisation on Australia''s levels of unemployment"}, {"max": 2, "min": 2, "descriptor": "Outlines an effect of globalisation on Australia''s unemployment"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Globalisation refers to the increased integration of individual economies on the basis of trade, financial flows, labour, investment and technology. Globalisation has increased competition from low cost producers, causing structural unemployment in import competing industries. For example, Australia’s passenger motor vehicle industry closing in 2017 led to roughly 50,000 individuals unemployed. However, globalisation has created jobs in export and service industries such as mining, international education and tourism, where Australia holds a comparative advantage. This is as we have a greater output in such industries, leading to higher derived demand of labour and thus employment.', 'A1 HSC Mock Exam 4 Q21(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-21b', NULL, 'Describe', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-21c', 'short', 't1-case-study', 5, 'Analyse strategies used to promote environmental sustainability in an economy other than Australia.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive analysis of strategies used to promote environmental sustainability in an economy other than Australia, making a clear judgement"}, {"max": 4, "min": 4, "descriptor": "Provides a sound analysis of strategies used to promote environmental sustainability in an economy other than Australia"}, {"max": 3, "min": 3, "descriptor": "Provides some explanation of strategies used to promote environmental sustainability in an economy"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of strategies and/or environmental sustainability"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'China has implemented a range of strategies to improve environmental sustainability, which involves conserving natural resources and limiting environmental degradation to preserve intergenerational and intragenerational equity. China has introduced a national Emissions Trading System (ETS), which places a price on carbon emissions for covered firms. By increasing the cost of emitting carbon, the scheme provides firms with a financial incentive to reduce emissions and invest in cleaner technologies, helping internalise the negative externality associated with emissions. This scheme has been moderately effective in promoting environmental sustainability, with carbon emissions falling by approximately 18.2%. Additionally, China’s Three Gorges Dam has promoted environmental sustainability by generating electricity without directly burning fossil fuels, reducing reliance on coal-fired electricity and associated carbon emissions. However, its environmental benefits are partly offset by negative impacts including habitat disruption, flooding and changes to the Yangtze River ecosystem.', 'A1 HSC Mock Exam 4 Q21(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-21c', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-22b', 'short', 't2-trade-flows', 3, 'Explain ONE likely change to the structure of Industry in Australia as a result of current trends in the global economy.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains one likely change to the structure of industry in Australia as a result of current trends in the global economy"}, {"max": 2, "min": 2, "descriptor": "Outlines one likely change to the structure of industry in Australia"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'One likely change is the expansion of Australia''s critical minerals sector, driven by the global transition to renewable energy and electric vehicles. Rising world demand for lithium, rare earths and nickel increases export prices and returns attracting capital and labour into mining and mineral processing. Australia already produces around half of the world''s lithium, and the US Australia critical minerals framework signed in October 2025 aims to diversify supply chains away from China. Government incentives such as the Critical Minerals Production Tax Incentive further encourage domestic processing. This shifts Australia''s industry structure toward resource-based and higher value added processing activities.', 'A1 HSC Mock Exam 4 Q22(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-22b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-22c', 'short', 't2-trade-flows', 6, 'Assess the impact of recent changes in the global economy on Australia’s trade and financial flows.', NULL, NULL, NULL, '[{"max": 6, "min": 6, "descriptor": "Provides a comprehensive assessment of the impact of recent changes in the global economy on Australia''s trade AND financial flows, making a clear judgement"}, {"max": 5, "min": 5, "descriptor": "Provides a sound assessment of the impact of recent changes in the global economy on Australia''s trade and financial flows"}, {"max": 4, "min": 4, "descriptor": "Provides some assessment of the impact of recent changes in the global economy on Australia''s trade and/or financial flows"}, {"max": 3, "min": 3, "descriptor": "Provides some explanation of recent changes in the global economy and/or Australia''s trade and financial flows"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of the global economy and/or trade and financial flows"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Recent changes in the global economy have had a mixed impact on Australia''s trade and financial flows, reducing export revenue while diversifying trade and supporting capital inflows. China''s economic slowdown and in particular its weak property sector, has reduced demand for steel and lowered iron ore prices. As China takes around one third of Australia''s goods exports, this has lowered export revenue, contributing to the current account returning to a deficit of around 2 per cent of GDP after surpluses from 2019 to 2022 through a lower level of the Balance of Goods and Services. However, this has encouraged diversification toward markets such as India and ASEAN.

Rising global protectionism, including the US''s 10 per cent baseline tariff on Australian goods in 2025, has threatened trade volumes. However, its direct impact is limited as the US takes only around 5 per cent of Australia''s goods exports, and Productivity Commission modelling found the tariffs could raise Australian GDP by 0.37 per cent through redirected capital inflows. Financial flows have also shifted. Superannuation assets exceeding $4 trillion have increased outward equity investment, making Australia a net foreign equity asset holder, while global demand for critical minerals has attracted foreign direct investment into mining.

Overall, recent global changes have had a moderately negative short term impact on trade flows, but have diversified Australia''s trade and strengthened its financial position.', 'A1 HSC Mock Exam 4 Q22(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-22c', NULL, 'Assess', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-23a', 'short', 't3-distribution', 2, 'Outline ONE reason why wealth may be distributed more unequally than income in Australia.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Outlines one reason why wealth may be distributed more unequally than income in Australia"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Wealth is a stock that accumulates over time, whereas income is a flow received over a period. High income households can save and invest in assets such as property and shares, which generate returns and capital gains that compound over time, while low income households spend most of their income on consumption. Inheritance further concentrates wealth. This is reflected in Australia''s wealth Gini coefficient of 0.611 compared to 0.308 for income in 2023-24.', 'A1 HSC Mock Exam 4 Q23(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-23a', NULL, 'Outline', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-23b', 'short', 't3-distribution', 3, 'Explain how an increase in unemployment may affect the distribution of income in Australia.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains how an increase in unemployment may affect the distribution of income in Australia"}, {"max": 2, "min": 2, "descriptor": "Outlines how an increase in unemployment may affect the distribution of income"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'An increase in unemployment is likely to widen income inequality in Australia. Unemployment is concentrated among low-skilled and low-income workers, who lose wage income and must rely on welfare. As JobSeeker pays less than half the national minimum wage, their income falls sharply relative to higher income earners, whose jobs are more secure. Long-term unemployment also erodes skills, reducing future earning capacity. However, progressive taxation and transfer payments partially offset this. Overall, a rise from the current 4.5 per cent unemployment rate would likely increase the Gini coefficient and shift the Lorenz curve further from the line of equality.', 'A1 HSC Mock Exam 4 Q23(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-23b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-23c', 'short', 't3-distribution', 5, 'Analyse the effects of greater income inequality on economic growth in Australia.', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive analysis of the effects of greater income inequality on economic growth in Australia"}, {"max": 4, "min": 4, "descriptor": "Provides a sound analysis of the effects of greater income inequality on economic growth in Australia"}, {"max": 3, "min": 3, "descriptor": "Provides some analysis of the effects of income inequality on economic growth"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of income inequality and/or economic growth"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Income inequality refers to the disparity of incomes (returns of 4 factors of production) between a population.

Inequality can positively impact growth through providing greater incentives for individuals to work, gain skills and take entrepreneurial risk, as higher productivity is rewarded with higher incomes. Higher income earners also have a higher marginal propensity to save, thus increasing funds available for investment, which expands aggregate supply increasing the productive capacity of the economy.

However, excessive inequality can constrain growth. Low-income households have a higher marginal propensity to consume, so shifting income toward high-income earners reduces consumption, the largest component of AD at around 55 per cent of GDP, lowering short-run growth. Inequality can also limit access to education for low-income groups, reducing human capital and labour productivity, which has grown weakly in Australia over the past decade. Rising inequality, with Australia''s income Gini increasing from 0.302 in 1994-95 to 0.324 in 2019-20, may also increase welfare spending, reducing funds for productive investment.', 'A1 HSC Mock Exam 4 Q23(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-23c', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m4-24a', 'short', 't4-fiscal', 2, 'Distinguish between the structural and cyclical components of a budget outcome.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Distinguishes between the structural and cyclical components of a budget outcome"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'The structural component of a budget outcome reflects discretionary policy decisions, such as changes to tax rates or spending programs. The cyclical component reflects automatic changes in revenue and spending caused by fluctuations in economic activity, through key automatic stabilisers such as progressive income tax and unemployment benefits. The key distinguishing factor is that the structural component is determined by government decisions whereas the cyclical component is determined by the business cycle.', 'A1 HSC Mock Exam 4 Q24(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm4-24a', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-21a', 'short', 't1-trade', 2, 'Outline ONE way transnational corporations contribute to globalisation', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Outlines ONE way transnational corporations contribute to globalisation"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Globalisation refers to the increased integration of individual economies on the basis of trade, finance, investment & Transnational corporations (TNCs), labour and technology. TNCs contribute to globalisation by spreading production across many countries through foreign direct investment (FDI). For example, a TNC may design products in one economy and manufacture components in others to take advantage of lower costs. This increases international trade in goods and services and integrates national economies into global supply chains.', 'A1 HSC Mock Exam 5 Q21(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-21a', NULL, 'Outline', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-21c', 'short', 't1-development', 5, 'Compare the effects of international migration on advanced and developing economies', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive comparison of the effects of international migration on advanced and developing economies, clearly identifying similarities and differences"}, {"max": 4, "min": 4, "descriptor": "Provides a sound comparison of the effects of international migration on advanced and developing economies"}, {"max": 3, "min": 3, "descriptor": "Provides some comparison of the effects of international migration on advanced and/or developing economies"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of international migration and/or its effects"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'International migration is the movement of people between countries in search of employment and higher incomes. Its effects differ because advanced economies (those with high levels of development and GDP) are mainly host economies, while developing economies (those with low levels of development and GDP) are mainly source economies.

In advanced economies, international migration increases labour supply. This fills skill shortages which supports economic growth via aggregate supply through higher levels of labour productivity. In contrast, developing economies lose workers. This can reduce unemployment where there is a labour surplus. However, it often causes a “brain drain” of skilled professionals such as doctors and engineers, reducing productive capacity and the quality of essential services.

Furthermore, individuals from developing nations who migrate to advanced nations typically send capital back to their nation to help their families financially. These remittance outflows from advanced economies are small relative to GDP. For developing economies, remittances are a major source of household income and foreign currency. They reduce poverty, fund education and health, and support the balance of payments. Although both nations experience different outcomes, advanced nations gain skilled labour to fill shortages, while developing nations gain capital via remittances.', 'A1 HSC Mock Exam 5 Q21(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-21c', NULL, 'Compare', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-22a', 'short', 't2-exchange-rates', 1, 'Define Trade Weighted Index', NULL, NULL, NULL, '[{"max": 1, "min": 1, "descriptor": "Correctly defines the Trade Weighted Index"}]', NULL, 'The Trade Weighted Index (TWI) measures the value of the Australian dollar against a basket of the currencies of Australia''s major trading partners according to 2-way trade.', 'A1 HSC Mock Exam 5 Q22(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-22a', NULL, 'Define', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-22b', 'short', 't2-exchange-rates', 3, 'Explain why an economy''s international competitiveness may improve even when its exchange rate appreciates', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains why international competitiveness may improve even when the exchange rate appreciates"}, {"max": 2, "min": 2, "descriptor": "Outlines why international competitiveness may improve even when the exchange rate appreciates"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'International competitiveness is the ability of an economy''s firms to sell goods and services at a cheaper price point than global competitors. It depends on relative costs and quality, not only on the exchange rate. If labour productivity growth is strong, firms produce more output per hour worked, which lowers unit labour costs. If these cost savings outweigh the higher foreign currency prices caused by the appreciation, domestic firms can still undercut foreign competitors, so competitiveness improves overall. Similarly, if domestic inflation is lower than that of trading partners, relative prices can fall even as the currency rises.', 'A1 HSC Mock Exam 5 Q22(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-22b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-22c', 'short', 't2-bop', 6, 'Analyse the effects of an appreciation of the Australian dollar on Australia’s balance of payments.', NULL, NULL, NULL, '[{"max": 6, "min": 6, "descriptor": "Provides a comprehensive analysis of the effects of an appreciation of the Australian dollar on the components of Australia''s balance of payments, showing the links between components, with relevant data"}, {"max": 5, "min": 5, "descriptor": "Provides a sound analysis of the effects of an appreciation of the Australian dollar on Australia''s balance of payments"}, {"max": 4, "min": 4, "descriptor": "Provides some analysis of the effects of an appreciation on at least one component of the balance of payments"}, {"max": 3, "min": 3, "descriptor": "Explains some effect(s) of an appreciation on the balance of payments"}, {"max": 2, "min": 2, "descriptor": "Outlines an effect of an appreciation and/or the balance of payments"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'An appreciation is a rise in the value of the Australian dollar against other currencies. The balance of payments (BOP) records all financial transactions between Australia and the rest of the world over a period and is divided into the current account (CA) and the capital and financial account (KAFA).

A higher AUD, such as its rise from below US60c in March 2020 to around US80c in early 2021, makes exports more expensive in foreign currency and imports cheaper in Australian dollars. As a result, export volumes fall especially in education and tourism, while import volumes rise worsening the Balance of Goods and Services (BOGS → X–M). Cheaper servicing of foreign currency debt reduces net primary income debits, partly offsetting this. However, net primary income remains the largest debit in Australia''s current account. Overall, the current account balance deteriorates. This was seen through Australia recording its first current account surplus in 44 years in 2019, before returning to deficit from 2023. An implication of this however, can be seen through lower net exports reducing aggregate demand, slowing growth and employment in trade competing industries.

On the other hand in terms of the KAFA, higher interest rates, such as the cash rate increasing to 4.60% in 2026, widen the interest rate differential. This creates increased portfolio investment as investors opt to earn higher returns in Australia, leading to a higher demand of the $A and thus appreciation. As a result under a floating exchange rate, a weaker current account is matched by a larger KAFA surplus, increasing reliance on foreign borrowing and investment. An implication of this can be seen through inflows adding to net foreign liabilities, which had fallen from around 60% of GDP in 2016. This raises future net primary income debits and Australia''s vulnerability to sudden capital outflows.', 'A1 HSC Mock Exam 5 Q22(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-22c', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-23c', 'short', 't3-unemployment', 6, 'Analyse the economic and social costs of unemployment', NULL, NULL, NULL, '[{"max": 6, "min": 6, "descriptor": "Provides a comprehensive analysis of the economic and social costs of unemployment, showing the relationships between costs"}, {"max": 5, "min": 5, "descriptor": "Provides a sound analysis of the economic and social costs of unemployment"}, {"max": 4, "min": 4, "descriptor": "Provides some analysis of the economic and/or social costs of unemployment"}, {"max": 3, "min": 3, "descriptor": "Provides some explanation of the costs of unemployment"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of unemployment"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Unemployment refers to the state of actively seeking work, without work. In Australia, the unemployment rate rose to 4.6% in August 2026, its highest since late 2021, with underemployment at 6.2%.

In terms of economic costs, there is a loss of output. Unemployment is a permanent loss of potential output. Spare capacity of labour means the economy operates inside its production possibility frontier, so real GDP is lower than it could be. Furthermore, it would lead to weaker economic growth. Higher unemployment leads to lower or loss of incomes reducing household consumption and aggregate demand (AD = C + I + G + (X–M)), which slows growth further. Another economic cost can be seen through budgetary constraints. Through automatic stabilisers, the government pays more in unemployment benefits and collects less income tax, which widens the budget deficit.

In terms of social costs, firstly a lower household income widens income inequality and raises the risk of poverty. This would lead to the gini coefficient rising. Furthermore, unemployment is linked to poorer mental and physical health, family stress and higher crime rates, which add further costs for government services. These costs fall most heavily on young people, older workers, people with lower skills and particular regions, deepening disadvantage.', 'A1 HSC Mock Exam 5 Q23(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-23c', NULL, 'Analyse', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-24a', 'short', 't4-micro', 2, 'Distinguish between technical efficiency and allocative efficiency.', NULL, NULL, NULL, '[{"max": 2, "min": 2, "descriptor": "Provides a distinguishing factor between technical efficiency and allocative efficiency"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Technical efficiency occurs when firms produce goods and services at the lowest possible cost, using the fewest resources for a given level of output. Allocative efficiency occurs when resources are allocated to producing the combination of goods and services that consumers value most. The key difference is that technical efficiency concerns how goods are produced in terms of cost, while allocative efficiency concerns what is produced in terms of resources.', 'A1 HSC Mock Exam 5 Q24(a)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-24a', NULL, 'Distinguish', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-24b', 'short', 't4-micro', 3, 'Explain how deregulation can increase efficiency in a product market.', NULL, NULL, NULL, '[{"max": 3, "min": 3, "descriptor": "Explains how deregulation can increase efficiency in a product market"}, {"max": 2, "min": 2, "descriptor": "Outlines how deregulation can increase efficiency in a product market"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Deregulation is the removal of government restrictions that reduce competition in a market, such as limits on the number of firms or price controls. Lower barriers to entry allow new firms to enter a product market. Existing firms are then forced to cut costs and improve operations to protect market share, which increases technical efficiency. Greater competition also pushes firms to supply the goods and services consumers value most at competitive prices, because firms that fail to respond lose customers. This improves allocative efficiency. For example, deregulation of Australia''s domestic aviation market allowed new airlines to enter, which lowered airfares and increased choice.', 'A1 HSC Mock Exam 5 Q24(b)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-24b', NULL, 'Explain', 'retired', NULL, '2026-10-20 12:57:27.31337+11');
INSERT INTO public.questions (id, type, topic_id, marks, stem, stimulus, options, correct_index, criteria, guideline_notes, sample_answer, source, year, created_at, origin, origin_ref, explanation, verb, status, duplicate_of, updated_at) VALUES ('a1-m5-24c', 'short', 't4-micro', 5, 'Assess the impact of microeconomic reform on individuals and firms in Australia', NULL, NULL, NULL, '[{"max": 5, "min": 5, "descriptor": "Provides a comprehensive assessment of the impact of microeconomic reform on individuals and firms in Australia"}, {"max": 4, "min": 4, "descriptor": "Provides a sound assessment of the impact of microeconomic reform on individuals and firms in Australia"}, {"max": 3, "min": 3, "descriptor": "Provides some assessment of the impact of microeconomic reform on individuals and/or firms"}, {"max": 2, "min": 2, "descriptor": "Provides some understanding of microeconomic reform"}, {"max": 1, "min": 1, "descriptor": "Provides some relevant information"}]', NULL, 'Microeconomic reform refers to policies that improve the efficiency and productivity of individual markets and industries, shifting aggregate supply to the right. Its long-run impact on individuals and firms is largely positive, but it imposes significant short run costs.

For individuals, consumers benefit from lower prices, greater choice and higher quality as competition increases. This was seen through the introduction of 16 foreign banks in 1983 after Australia’s financial deregulation. Increased competition from foreign banks, led to greater variety of services and lower prices overall in the financial market. However, firms that cannot compete may close or restructure, causing structural unemployment, especially among older or lower-skilled workers and in regional areas showcasing limitations of microeconomic policy. This was seen through the reduction of protection via trade and industry microeconomic reforms in the passenger motor vehicle industry, whereby 50,000 individuals were left structurally unemployed following the closure of the industry in 2017.

For firms, efficient businesses gain from cheaper inputs such as energy, transport and telecommunications, and from access to new markets. This was primarily seen in Australia through the decrease in overall protectionism via trade and industry reforms to roughly 1%-2% in most industries. As a result, Australian firms source a large amount of their inputs from imports due to their cost feasibility, reflecting its highest import category of intermediate goods.This improves their profitability and international competitiveness. Less efficient firms face stronger competition and may lose market share or leave the industry. This showcases a limitation of microeconomic policy, where domestic market share may be lost.', 'A1 HSC Mock Exam 5 Q24(c)', 2026, '2026-10-20 12:57:27.31337+11', 'a1', 'm5-24c', NULL, 'Assess', 'retired', NULL, '2026-10-20 12:57:27.31337+11');

INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('8e9abc8b-dc5e-4f27-8342-e454d8bde349', 'a1-ge-4', 'International organisations such as the International Monetary Fund (IMF), World Bank, and World Trade Organization play a significant role in promoting global economic stability, growth, and integration.
On one hand, these organisations enhance economic performance. The IMF provides financial assistance and policy advice to countries facing balance of payments crises, helping stabilise exchange rates and prevent global financial contagion. The World Bank promotes long-term growth by funding infrastructure and development projects in developing economies, improving productivity and living standards. The WTO facilitates global trade by reducing tariffs and enforcing trade rules, increasing efficiency through comparative advantage and expanding global output.
However, their impact is not entirely positive. IMF loans often come with strict conditions such as austerity measures, which can reduce economic growth and worsen unemployment in the short term. Similarly, WTO policies promoting free trade may disadvantage developing nations that struggle to compete with advanced economies, leading to unequal distribution of gains from trade. Additionally, World Bank projects have sometimes been criticised for environmental damage and insufficient local benefits.
Overall, international organisations have had a substantial positive impact on the global economy by promoting stability, trade, and development, but their policies can also create short-term economic costs and inequality, meaning their impact is mixed.', 3, 'Demonstrates some understanding with partial analysis', '[]', '[]', 'test', 'a1', 'a04d6f4ea087e5cbe9b0b979c62d4356', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('685dbab1-11db-479d-8185-d0ee3f548ef9', 'a1-ge-1', 'A trading bloc is a group of countries that agree to reduce or eliminate trade barriers such as tariffs and quotas between members to promote trade (e.g. European Union single market features).
A monetary union goes further, where member countries share a common currency and central monetary policy, meaning they lose control over individual interest rates (e.g. the euro used by some EU members under the European Central Bank).', 2, 'Clearly distinguishes both concepts using correct terminology and an example', '[]', '[]', 'test', 'a1', 'c4f16d276bdfcabcd65c09493f68b4cc', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('70255820-935e-41c8-86a9-b19d744bf7dd', 'a1-ep-1', 'One strategy used by China to promote environmental sustainability is the implementation of a national emissions trading scheme (ETS).
This policy places a cap on carbon emissions and allows firms to buy and sell permits, creating a financial incentive to reduce pollution. Firms that lower emissions can sell excess permits, while high polluters face higher costs. This encourages cleaner production methods and investment in renewable energy, helping reduce overall carbon emissions and improve environmental outcomes.', 2, 'Sketches one strategy with limited detail', '[]', '[]', 'test', 'a1', 'b9141d2e27499ea2c58b0318ab1adf33', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('3fbaeaf1-5a39-48fc-bfbf-9a8fbe2ccc44', 'a1-ge-5', 'Australia’s trade flows have experienced significant changes in both composition and direction. In terms of composition, exports have shifted toward resource-based and service exports, with minerals such as iron ore and LNG dominating due to strong global demand, alongside growing service exports like education and tourism, reflecting Australia’s comparative advantage and boosting export earnings. In terms of direction, trade has increasingly shifted toward the Asia-Pacific region, particularly China, Japan, and South Korea, driven by rapid industrialisation and rising incomes in these economies. This has strengthened Australia’s integration with Asia but also increased vulnerability to economic fluctuations in the region.', 3, 'Discusses changes with some examples but limited depth', '[]', '[]', 'test', 'a1', '1f32b3a1ec93d73b4c96692ef3d62a19', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('404f3fbe-1052-4ced-8771-5575ae8f79df', 'a1-ge-2', 'The capital account records one-off transfers of assets and liabilities, such as debt forgiveness and transfers of ownership of non-produced assets (e.g. patents). The financial account records transactions involving the buying and selling of financial assets, such as foreign investment, loans, and equity flows, which directly affect Australia’s net foreign liabilities.', 2, 'Clearly distinguishes both accounts with correct terminology/examples', '[]', '[]', 'test', 'a1', '24749c8b08b33a433e1a0bcaaafb1a9a', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('c73af6a0-a08a-4e99-8901-e7248e589d06', 'a1-ge-3', 'An appreciation of the Australian dollar makes Australian exports more expensive for foreign buyers and imports cheaper for domestic consumers. This reduces the international competitiveness of exports, leading to a fall in export volumes, while cheaper imports increase import demand. As a result, export revenue decreases and import expenditure rises, causing a deterioration in the balance on goods and services (BOGS), potentially moving it toward a deficit or reducing a surplus.', 2, 'Sketches in general terms the effect of appreciation on trade', '[]', '[]', 'test', 'a1', 'ce3567fb3e7cb3b06cf607632c018c21', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('014b0a92-24a2-4f62-8be4-c439edc315e7', 'a1-ei-1', 'Cyclical unemployment arises from downturns or upswings in the business cycle as labour is a derived demand from GDP. Structural unemployment refers to whereby workers no longer have skills which are required within the economy and hence become jobless.', 1, 'Provides some relevant information but incomplete or unclear distinction', '[]', '[]', 'test', 'a1', '7c3da49722a5fff9d0ff2a73c2baaf55', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('9519a052-40e1-46c4-aedf-83308dae97fa', 'a1-ei-2', 'High inflation increases domestic production costs, making exports more expensive relative to foreign goods. This reduces international competitiveness as demand for exports falls and imports become relatively cheaper, worsening trade performance.', 2, 'Provides a clear description linking inflation to reduced competitiveness', '[]', '[]', 'test', 'a1', '149413eac33e9f2a54a2c2ab99f033b5', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('d9b3af19-9f04-42eb-ac87-744b4e03a0ad', 'a1-ei-3', 'Income inequality in Australia can be analysed through its dimensions (extent and distribution of income) and trends over time, both of which have important economic impacts. A higher level of inequality means income is concentrated among higher earners, reducing the spending power of low-income households who have a higher marginal propensity to consume. This can weaken aggregate demand and slow economic growth. Over time, if inequality is rising, it can lead to reduced access to education and healthcare for lower-income groups, lowering human capital and productivity. However, some inequality can provide incentives for work, investment, and innovation. Overall, excessive or rising inequality can negatively affect economic stability and long-term growth, while moderate inequality may support economic efficiency.', 2, 'Sketches inequality and its effects', '[]', '[]', 'test', 'a1', '0e1e4813f69d43d4adfa64dfee39f4a5', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('4d25dbd5-5d6c-465d-be1c-6aa6a662ba19', 'a1-ep-3', 'A carbon tax is a market-based policy that places a price on pollution, directly targeting the negative externality from production. Firms that emit carbon face higher costs per unit of output, which shifts their private cost closer to the true social cost of production. This incentivises firms to reduce emissions, adopt cleaner technologies, or switch to renewable energy sources. As a result, production falls toward the socially optimal level where social cost equals social benefit, reducing overallocation of resources and correcting the market failure.', 3, 'Explains the concept with some link to market failure but missing depth', '[]', '[]', 'test', 'a1', '9769cd0435438e394692fa7a9cbcb289', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('d342519a-66b1-414f-8112-6fc415735112', 'a1-ei-5', 'A common conflict exists between low inflation and low unemployment. Policies used to reduce inflation, such as contractionary monetary or fiscal policy, can slow economic growth and reduce aggregate demand, leading to higher unemployment. Conversely, policies aimed at lowering unemployment by stimulating demand can increase inflationary pressures, creating a trade-off between these objectives.', 1.5, 'Outlines one objective or provides some relevant information', '[]', '[]', 'test', 'a1', '2be7c01cb8a1bd26b6f3d01ac096e7bb', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('4705198e-008b-4c03-be44-68d402d86df1', 'a1-ei-4', 'Governments in Australia often face trade-offs when pursuing multiple macroeconomic objectives, as achieving one goal can undermine another. For example, there is a conflict between low inflation and low unemployment. Contractionary policies used to reduce inflation, such as higher interest rates, decrease aggregate demand and can lead to higher unemployment. Conversely, expansionary policies aimed at reducing unemployment can increase demand-pull inflation. A second conflict exists between economic growth and external stability. Strong economic growth increases incomes and spending, often leading to higher import demand and a deterioration in the current account balance. This can worsen external stability, particularly if it increases reliance on foreign borrowing. A third conflict arises between economic growth and environmental sustainability. Policies that promote growth, such as increased production and resource extraction, can lead to environmental degradation and higher carbon emissions, undermining sustainability objectives. Overall, these conflicts highlight that governments must prioritise and carefully balance objectives, as achieving all simultaneously is difficult.', 3.5, 'Basic explanation; may only properly cover two objectives', '[]', '[]', 'test', 'a1', '1d58dbf91da4ca32fbca8e736a7b4cd2', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('7c791080-7d19-4b68-8293-1876b256380c', 'a1-fm-2', 'The crowding-out effect occurs when increased government spending, often funded by borrowing, leads to higher interest rates as the government competes with the private sector for available funds. This rise in interest rates discourages private investment and consumption, as borrowing becomes more expensive. As a result, the effectiveness of expansionary fiscal policy is reduced, since some of the increase in aggregate demand is offset by a fall in private sector spending.', 2.5, 'Sketches the concept in general terms', '[]', '[]', 'test', 'a1', '1635b9ed2f82bd220fe67315ea9783ca', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('46129f8e-566f-4c16-876d-469f5f6c2d2d', 'a1-fm-4', 'Automatic stabilisers are components of fiscal policy that operate automatically to smooth economic fluctuations, such as progressive income taxes and welfare payments, which increase or decrease without government intervention. Discretionary fiscal policy involves deliberate government decisions to change spending or taxation levels, such as stimulus packages or tax cuts, to influence economic activity.', 2, 'Clearly distinguishes both with correct terminology and examples', '[]', '[]', 'test', 'a1', '33209a272fdedfc8880288130d2d992a', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('1ef89b17-0c83-4585-847b-9427a139ec99', 'a1-fm-5', 'An expansionary fiscal stance involves the government increasing spending and/or reducing taxation to stimulate aggregate demand (AD). This leads to a rightward shift in AD, increasing real GDP and economic growth as consumption (C) and investment (I) rise. As output expands, firms increase production, leading to higher labour demand and a reduction in unemployment. However, increased AD can also generate demand-pull inflation if the economy is near full capacity, reducing price stability. Additionally, higher government spending may worsen the budget balance, leading to a larger deficit and increased public debt.', 2, 'General explanation of expansionary fiscal policy', '[]', '[]', 'test', 'a1', 'c0d694d3811e8802a710de5df58900a1', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('16e5e6c8-acb6-460d-8430-143c71217fd5', 'a1-fm-1', 'An expansionary fiscal stance involves the government increasing spending and/or reducing taxation to stimulate aggregate demand (AD). This leads to a rightward shift in AD, increasing real GDP and economic growth as consumption (C) and investment (I) rise. As output expands, firms increase production, leading to higher labour demand and a reduction in unemployment. However, increased AD can also generate demand-pull inflation if the economy is near full capacity, reducing price stability. Additionally, higher government spending may worsen the budget balance, leading to a larger deficit and increased public debt.', 2, 'Identifies some limitations with limited comparison', '[]', '[]', 'test', 'a1', 'b6191da6b65d579b8a6a03e86308919d', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('a0b59f6a-c775-4430-8662-07cc9cdd1e08', 'a1-mp-2', 'Microeconomic policies aim to improve the efficiency and flexibility of markets, leading to structural changes in the Australian economy. One key change is the shift of resources towards more productive and competitive industries. Policies such as deregulation and trade liberalisation reduce protection, causing inefficient firms to exit and allowing more efficient firms to expand. Additionally, labour market reforms increase flexibility, leading to changes in employment patterns. This includes a shift towards part-time, casual, and service-based employment as firms adapt to market conditions. Finally, microeconomic reform often results in a more internationally competitive economy, with greater integration into global markets and a move away from manufacturing towards services and export-oriented industries.', 2, 'General explanation with limited detail/example', '[]', '[]', 'test', 'a1', 'f13996f4108f9f893948c0599ea92f27', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('cf3d28b1-7716-462a-836a-cb8eae0a36c0', 'a1-mp-4', 'Centralised wage determination involves wages being set at a national or industry-wide level, typically through government bodies or tribunals such as the Fair Work Commission. This results in standardised wages and conditions across firms and industries. In contrast, decentralised wage determination occurs at the firm or individual level, where wages are negotiated between employers and employees through enterprise bargaining or individual contracts. This leads to greater flexibility, with wages more closely linked to productivity and firm-specific conditions. Thus, centralised systems promote equity and consistency, while decentralised systems promote flexibility and efficiency.', 3, 'Clearly distinguishes both systems with examples and key features', '[]', '[]', 'test', 'a1', 'c91f5a0256d051425d637f0ab15dd349', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('70248cf5-1bf0-4fb9-a754-471b0750389f', 'a1-ep-5', 'International agreements play a significant role in shaping Australia’s environmental policy by setting targets, influencing domestic regulation, and encouraging coordinated global action. Firstly, agreements such as the Paris Agreement establish emissions reduction targets, which Australia incorporates into national policy. This has led to commitments such as net zero emissions by 2050 and policies aimed at reducing greenhouse gas emissions. Secondly, international agreements encourage the implementation of domestic policies to meet these obligations. For example, Australia has adopted measures such as renewable energy investment, emissions reduction funds, and regulatory frameworks to align with global standards. Additionally, these agreements promote cooperation and accountability. Participation enhances Australia’s international reputation and ensures it contributes to global environmental sustainability efforts, while also allowing access to global knowledge, technology, and climate finance. However, the effectiveness of these agreements can be limited by their non-binding nature and domestic political constraints, which may reduce the extent or speed of policy implementation. Overall, international agreements strongly influence Australia’s environmental policy direction, though their impact depends on domestic commitment and enforcement.', 3, 'Explains the role with limited examples', '[]', '[]', 'test', 'a1', '64760c8fa10b93d6377c8d56b1ac081e', '2026-10-20 12:57:27.237057+11');
INSERT INTO public.marking_examples (id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments, split, origin, source_hash, created_at) VALUES ('d57560a4-ac2c-4e55-a061-e68a81148008', 'a1-ep-4', 'One limitation is the presence of time lags. Environmental policies, such as emissions reduction or renewable energy investment, take significant time to implement and for their effects to be realised, delaying improvements in environmental outcomes. Another limitation is global influences. Environmental issues like climate change are global in nature, so Australia’s policies alone have limited impact if other countries do not take similar action, reducing overall effectiveness.', 2, 'Outlines one limitation in detail or two with limited detail', '[]', '[]', 'test', 'a1', 'c52b429814c689f5483e45412333a90c', '2026-10-20 12:57:27.237057+11');

INSERT INTO storage.buckets (id, name, owner, public, file_size_limit, allowed_mime_types, created_at, updated_at) VALUES ('answers', 'answers', NULL, false, 10485760, '{image/jpeg,image/png,image/webp,image/heic}', '2026-10-20 12:57:26.379413+11', '2026-10-20 12:57:26.379413+11');
INSERT INTO storage.buckets (id, name, owner, public, file_size_limit, allowed_mime_types, created_at, updated_at) VALUES ('reports', 'reports', NULL, false, 5242880, '{image/png,image/jpeg,image/webp}', '2026-10-20 12:57:26.999016+11', '2026-10-20 12:57:26.999016+11');
INSERT INTO storage.buckets (id, name, owner, public, file_size_limit, allowed_mime_types, created_at, updated_at) VALUES ('evals', 'evals', NULL, false, NULL, NULL, '2026-10-20 12:57:27.482855+11', '2026-10-20 12:57:27.482855+11');
INSERT INTO storage.buckets (id, name, owner, public, file_size_limit, allowed_mime_types, created_at, updated_at) VALUES ('question-images', 'question-images', NULL, true, 10485760, '{image/jpeg,image/png,image/webp}', '2026-10-20 12:57:27.620151+11', '2026-10-20 12:57:27.620151+11');

