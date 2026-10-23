-- Short-answer mark filters and independent Mixed question counts.
-- Legacy Mixed mark budgets remain supported. Invoker security and RLS are unchanged.

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
    'verbs', (select coalesce(jsonb_object_agg(verb, n), '{}') from (select verb, count(*) n
      from public.sprint_questions(p_config - 'verbs') where verb is not null group by 1) x),
    'difficulty', (select coalesce(jsonb_object_agg(d, n), '{}') from (select
      case when marks <= 3 then 'foundation' when marks <= 5 then 'standard' else 'challenging' end d, count(*) n
      from public.sprint_questions(p_config - 'difficulty') where type <> 'mcq' group by 1) x),
    'trial', exists (select 1 from public.questions q where q.status = 'live' and q.origin = 'a1')
  );
$$;

--
-- Name: sprint_questions(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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
      array(select jsonb_array_elements_text(coalesce(p_config -> 'verbs', '[]'))) as verbs,
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
    and (q.type <> 'short' or cfg.marks_per_short is null or q.marks = cfg.marks_per_short);
end;
$$;

--
-- Name: start_sprint(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.start_sprint(p_config jsonb) RETURNS uuid
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
  v_short_n int := 0;
  v_question_counts boolean := p_config ? 'short_count';
  v_picked text[] := '{}';
  v_sum int := 0;
  v_count int := 0;
  v_limit int;
  v_session uuid;
  r record;
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
    ('mixed', 'marks', 5, 100), ('mixed', 'questions', 5, 55)) b(mode, size_by, lo, hi)
  where b.mode = v_mode and b.size_by = v_size_by;
  if v_lo is null or v_target is null or v_target not between v_lo and v_hi then
    raise exception 'size is out of range';
  end if;
  -- Each mixed bucket is independent; missing MCs never become written marks.
  if v_mode = 'mixed' and v_question_counts then
    if jsonb_typeof(p_config -> 'mcq_count') is distinct from 'number'
      or (p_config ->> 'mcq_count')::numeric <> trunc((p_config ->> 'mcq_count')::numeric) then
      raise exception 'invalid mcq_count';
    end if;
    v_mcq_target := (p_config ->> 'mcq_count')::numeric::int;
    v_short_target := (p_config ->> 'short_count')::numeric::int;
    if v_size_by <> 'questions' or v_mcq_target not between 0 and 40
      or v_mcq_target + v_short_target <> v_target then
      raise exception 'invalid mixed question counts';
    end if;
  elsif v_mode = 'mixed' then
    if v_size_by <> 'marks' then raise exception 'invalid legacy mixed size'; end if;
    v_mcq_target := coalesce((p_config ->> 'mcq_count')::numeric::int,
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
      elsif v_question_counts then
        continue when v_short_n >= v_short_target;
        v_short_n := v_short_n + 1;
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

  if v_mode = 'mixed' and not v_question_counts then
    select key::int into v_short_marks from jsonb_object_keys(v_paths) paths(key)
    where key::int > 0 or v_short_target = 0
    order by abs(key::int - v_short_target), key::int > v_short_target
    limit 1;
    v_short_marks := coalesce(v_short_marks, 0);
    v_picked := v_picked || array(select jsonb_array_elements_text(v_paths -> v_short_marks::text));
    select count(*), coalesce(sum(q.marks), 0) into v_count, v_sum
      from public.questions q where q.id = any(v_picked);
  end if;

  if v_mode = 'mixed' then
    select coalesce(sum(q.marks), 0) into v_short_marks
      from public.questions q where q.id = any(v_picked) and q.type = 'short';
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
    'marks_per_short', p_config -> 'marks_per_short', 'origins', coalesce(p_config -> 'origins', '[]'),
    'history', v_history, 'order', 'exam',
    'timed', v_timed, 'time_limit_s', v_limit, 'short_min_per_mark', v_short_pace, 'mcq_min_per_q', v_mcq_pace, 'on_timeout', 'overtime',
    'feedback', v_feedback, 'actual_marks', v_sum, 'actual_questions', v_count) || case when v_mode = 'mixed' then jsonb_build_object(
    'mcq_count', v_mcq_target,
    'actual_mcq_count', v_mcq_n, 'actual_short_marks', v_short_marks) ||
    case when v_question_counts then jsonb_build_object('short_count', v_short_target, 'actual_short_count', v_short_n)
      else jsonb_build_object('short_marks', v_short_target) end else '{}'::jsonb end)
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

revoke all on function sprint_pool(jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function sprint_pool(jsonb) to authenticated;
grant EXECUTE on function sprint_pool(jsonb) to service_role;
revoke all on function sprint_questions(jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function sprint_questions(jsonb) to authenticated;
grant EXECUTE on function sprint_questions(jsonb) to service_role;
revoke all on function start_sprint(jsonb) from public, anon, authenticated, service_role;
grant EXECUTE on function start_sprint(jsonb) to authenticated;
grant EXECUTE on function start_sprint(jsonb) to service_role;
