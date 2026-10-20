-- Aggregate the requested bank questions without multiplying attempts by review rows.
create or replace function public.admin_question_stats(p_ids text[], p_detail boolean default false)
returns table(id text, attempts bigint, avg numeric, disagreements bigint, reports bigint,
  histogram jsonb, picks jsonb)
language plpgsql stable security definer set search_path = '' as $$
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
revoke execute on function public.admin_question_stats(text[], boolean) from public, anon;
grant execute on function public.admin_question_stats(text[], boolean) to authenticated;

-- Preserve every other student-list aggregate and the activity_days streak rules.
create or replace function public.admin_student_rows()
returns table (
  id uuid, full_name text, year_level smallint, school text, joined timestamptz,
  last_active timestamptz, sessions_7d bigint, sessions_total bigint,
  answered bigint, avg_30 numeric, streak int, open_disputes bigint, ai_spend numeric
)
language plpgsql stable security definer set search_path = '' as $$
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
revoke execute on function public.admin_student_rows() from public, anon;
grant execute on function public.admin_student_rows() to authenticated;
