-- S7: replace only timer handling, preserving the current question selector.
-- Fail atomically if start_sprint has an incompatible definition.
do $migration$
declare
  definition text := pg_get_functiondef('public.start_sprint(jsonb)'::regprocedure);
  original text := definition;
begin
  definition := replace(definition,
    'v_pace text := coalesce(p_config ->> ''pace'', ''hsc'');',
    'v_short_pace numeric := coalesce((p_config ->> ''short_min_per_mark'')::numeric, 1.5);
  v_mcq_pace numeric := coalesce((p_config ->> ''mcq_min_per_q'')::numeric, 1);');
  definition := replace(definition,
    'v_on_timeout text := coalesce(p_config ->> ''on_timeout'', ''overtime'');',
    'v_on_timeout text := ''overtime'';');
  definition := replace(definition, ' or v_pace not in (''hsc'', ''relaxed'', ''custom'')', '');
  definition := regexp_replace(definition, '  v_limit := case.*?  insert into public.sessions',
    '  if v_short_pace not between 0.25 and 10 or v_mcq_pace not between 0.25 and 10 then
    raise exception ''invalid sprint pace: use 0.25 to 10 minutes'';
  end if;
  select case when v_timed then round(sum(case x.type
    when ''mcq'' then 60 * v_mcq_pace
    when ''short'' then 60 * v_short_pace * x.marks else 2100 end))::int else null end
  into v_limit from public.questions x where x.id = any(v_picked);

  insert into public.sessions', 's');
  definition := replace(definition, '''pace'', v_pace,',
    '''short_min_per_mark'', v_short_pace, ''mcq_min_per_q'', v_mcq_pace,');
  if definition = original or definition like '%v_pace%' or definition like '%custom_minutes%'
    or definition not like '%60 * v_short_pace * x.marks%' then
    raise exception 'start_sprint timer definition changed; review S7 migration';
  end if;
  execute definition;
end;
$migration$;
