-- S3: lower the Mixed sprint minimum from 20 to 5 marks. Body identical to 0046 start_sprint except the mixed/marks lower bound.
-- create or replace preserves existing grants/owner (no grant changes here, as in 0046).
CREATE OR REPLACE FUNCTION public.start_sprint(p_config jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;
