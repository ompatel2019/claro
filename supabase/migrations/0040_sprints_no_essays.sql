-- S4: change only essay selection, preserving the installed timer implementation.
do $migration$
declare
  definition text := pg_get_functiondef('public.start_sprint(jsonb)'::regprocedure);
begin
  definition := replace(definition, 'v_mode not in (''mcq'', ''short'', ''extended'', ''mixed'')',
    'v_mode not in (''mcq'', ''short'', ''mixed'')');
  definition := replace(definition, 'v_mode in (''mcq'', ''extended'')', 'v_mode = ''mcq''');
  definition := replace(definition, ' when ''extended'' then 1', '');
  definition := replace(definition, '  v_extended boolean := v_mode = ''mixed'' and coalesce((p_config ->> ''include_extended'')::boolean, false);', '');
  definition := replace(definition, '  v_ext_n int := 0;', '');
  definition := replace(definition, '(''extended'', ''questions'', 1, 3), ', '');
  definition := replace(definition, 'public.sprint_questions(p_config) q',
    'public.sprint_questions(p_config - ''include_extended'') q');
  definition := replace(definition, 'when ''extended'' then not v_extended or v_ext_n > 0', '');
  definition := replace(definition, 'v_ext_n := v_ext_n + (r.type = ''extended'')::int;', '');
  definition := replace(definition, '''include_extended'', v_extended,', '');
  definition := replace(definition, 'array[''mcq'', ''short'', ''extended'']', 'array[''mcq'', ''short'']');
  definition := replace(definition, 'when ''short'' then 90 * x.marks else 2100', 'else 90 * x.marks');
  definition := replace(definition, 'when ''short'' then 60 * v_short_pace * x.marks else 2100', 'else 60 * v_short_pace * x.marks');
  if definition like '%v_extended%' or definition like '%v_ext_n%'
    or definition not like '%v_mode not in (''mcq'', ''short'', ''mixed'')%'
    or definition not like '%sprint_questions(p_config - ''include_extended'')%' then
    raise exception 'start_sprint essay definition changed; review S4 migration';
  end if;
  execute definition;
end;
$migration$;
