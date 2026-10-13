-- S6: random selection, fixed MC-first exam order for every new sprint.
create or replace function public.start_sprint(p_config jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mode text := p_config ->> 'mode';
  v_size_by text := coalesce(p_config ->> 'size_by', case when v_mode in ('mcq', 'extended') then 'questions' else 'marks' end);
  v_target int := coalesce((p_config ->> 'target')::int,
    case v_mode when 'mcq' then 20 when 'short' then 30 when 'extended' then 1 else 45 end);
  v_history text := coalesce(p_config ->> 'history', 'prefer_new');
  v_order text := 'exam';
  v_timed boolean := coalesce((p_config ->> 'timed')::boolean, true);
  v_pace text := coalesce(p_config ->> 'pace', 'hsc');
  v_on_timeout text := coalesce(p_config ->> 'on_timeout', 'overtime');
  v_feedback text := coalesce(p_config ->> 'feedback', 'end');
  v_lo int;
  v_hi int;
  v_mcq_target int;
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
    or v_order not in ('exam', 'shuffled') or v_pace not in ('hsc', 'relaxed', 'custom')
    or v_on_timeout not in ('overtime', 'finish') or v_feedback not in ('end', 'each')
    then
    raise exception 'invalid sprint settings';
  end if;
  select lo, hi into v_lo, v_hi from (values
    ('mcq', 'questions', 5, 40), ('short', 'marks', 10, 60), ('short', 'questions', 2, 15),
    ('mixed', 'marks', 20, 100)) b(mode, size_by, lo, hi)
  where b.mode = v_mode and b.size_by = v_size_by;
  if v_lo is null or v_target is null or v_target not between v_lo and v_hi then
    raise exception 'size is out of range';
  end if;
  -- Mixed keeps the HSC paper balance: about 40% of the marks from multiple choice.
  v_mcq_target := case when v_mode = 'mixed' then round(v_target * 0.4) end;

  for r in
    select q.* from public.sprint_questions(p_config - 'include_extended') q
    where case v_history when 'new_only' then not q.seen when 'mistakes' then q.mistake
      when 'flagged' then q.flagged else true end
    order by case when v_history = 'prefer_new' then q.seen end, case when v_history = 'prefer_new' then q.last_seen end,
      random()
  loop
    if v_mode = 'mixed' then
      continue when case r.type
        when 'mcq' then v_mcq_n >= v_mcq_target
        else v_short_marks + r.marks > v_target - v_mcq_target end;
      v_mcq_n := v_mcq_n + (r.type = 'mcq')::int;
      v_short_marks := v_short_marks + case when r.type = 'short' then r.marks else 0 end;
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

  if v_count = 0 then raise exception 'no questions match these settings'; end if;

  v_limit := case
    when not v_timed then null
    when v_pace = 'custom' then (p_config ->> 'custom_minutes')::int * 60
    else round((select sum(case x.type when 'mcq' then 60 when 'short' then 90 * x.marks else 2100 end)
      from public.questions x where x.id = any(v_picked)) * case when v_pace = 'relaxed' then 1.5 else 1 end)
  end;
  if v_timed and v_pace = 'custom' and (v_limit is null or v_limit not between 300 and 10800) then
    raise exception 'custom time must be 5 to 180 minutes';
  end if;

  insert into public.sessions (kind, config)
  values ('sprint', jsonb_build_object(
    'mode', v_mode,
    'topics', coalesce(p_config -> 'topics', '[]'), 'subtopics', coalesce(p_config -> 'subtopics', '[]'),
    'size_by', v_size_by, 'target', v_target,
    'difficulty', coalesce(p_config -> 'difficulty', '[]'), 'verbs', coalesce(p_config -> 'verbs', '[]'),
    'year_from', p_config -> 'year_from', 'year_to', p_config -> 'year_to', 'origins', coalesce(p_config -> 'origins', '[]'),
    'history', v_history, 'order', v_order,
    'timed', v_timed, 'time_limit_s', v_limit, 'pace', v_pace, 'on_timeout', v_on_timeout,
    'feedback', v_feedback, 'actual_marks', v_sum, 'actual_questions', v_count))
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
revoke execute on function public.start_sprint(jsonb) from public, anon;
grant execute on function public.start_sprint(jsonb) to authenticated;
