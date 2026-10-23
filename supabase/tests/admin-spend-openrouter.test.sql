-- 0083: admin spend totals and the spend chart count OpenRouter models only.
begin;
insert into auth.users (id) values ('c2000000-0000-0000-0000-000000000001');
update public.profiles set role = 'admin' where id = 'c2000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);
create temporary table c2_before on commit drop as select public.admin_dashboard() as d;
reset role;
insert into public.ai_usage (created_at, task, model, input_tokens, output_tokens, usd) values
  (now(), 'sql-test', 'anthropic/claude-test', 1, 1, 1.50),
  (now(), 'sql-test', 'openai/gpt-test', 1, 1, 2.25),
  (now(), 'sql-test', 'gpt-test', 1, 1, 100),
  (now(), 'sql-test', 'xanthropic/claude-test', 1, 1, 100),
  (now() - interval '40 days', 'sql-test', 'anthropic/claude-test', 1, 1, 4),
  (now() + interval '1 day', 'sql-test', 'openai/gpt-test', 1, 1, 100);
set local role authenticated;
do $$
declare
  b jsonb := (select d from c2_before);
  a jsonb := public.admin_dashboard();
  today text := ((now() at time zone 'Australia/Sydney')::date)::text;
begin
  if (a #>> '{spend,month}')::numeric - (b #>> '{spend,month}')::numeric <> 3.75
    or (a #>> '{spend,all}')::numeric - (b #>> '{spend,all}')::numeric <> 7.75 then
    raise exception 'spend must count OpenRouter only: before %, after %', b -> 'spend', a -> 'spend';
  end if;
  if (a ->> 'spendTotal')::numeric - (b ->> 'spendTotal')::numeric <> 3.75
    or (select (x ->> 'value')::numeric from jsonb_array_elements(a -> 'spendPerDay') x where x ->> 'day' = today)
      - (select (x ->> 'value')::numeric from jsonb_array_elements(b -> 'spendPerDay') x where x ->> 'day' = today) <> 3.75 then
    raise exception 'spend chart must count OpenRouter only';
  end if;
end $$;
reset role;
do $$
begin
  if not has_function_privilege('authenticated', 'public.admin_dashboard()', 'execute')
    or not has_function_privilege('service_role', 'public.admin_dashboard()', 'execute')
    or has_function_privilege('anon', 'public.admin_dashboard()', 'execute') then
    raise exception 'admin_dashboard grants changed';
  end if;
end $$;
rollback;
