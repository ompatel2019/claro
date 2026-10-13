-- S6: random selection, fixed MC-first exam order; preserve installed pacing.
do $migration$
declare
  definition text := pg_get_functiondef('public.start_sprint(jsonb)'::regprocedure);
begin
  definition := regexp_replace(definition, '  v_order text := [^\n]*;\n', '');
  definition := replace(definition, 'or v_order not in (''exam'', ''shuffled'')', '');
  definition := replace(definition, '''order'', v_order', '''order'', ''exam''');
  definition := replace(definition, 'case when v_order = ''exam'' then array_position(array[''mcq'', ''short''], q.type) end',
    'array_position(array[''mcq'', ''short''], q.type)');
  definition := replace(definition, 'case when v_order = ''exam'' then q.year end', 'q.year');
  definition := replace(definition, 'case when v_order = ''exam'' then (substring(q.source from ''Q(\d+)''))::int end',
    '(substring(q.source from ''Q(\d+)''))::int');
  definition := replace(definition, 'case when v_order = ''exam'' then q.source end', 'q.source');
  if definition like '%v_order%' or definition not like '%''order'', ''exam''%' then
    raise exception 'start_sprint order definition changed; review S6 migration';
  end if;
  execute definition;
end;
$migration$;
