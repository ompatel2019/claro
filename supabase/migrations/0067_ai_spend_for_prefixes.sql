-- Requires Om/master sign-off before production application.
-- KILL_LIST E11: openRouterSpend() summed every matching ai_usage row client-side.
-- Same rows (model starts with one of the given prefixes), summed in SQL. Service only.
-- Apply BEFORE deploying the matching app change (callJson calls this RPC).
create or replace function public.ai_spend_for_prefixes(p_prefixes text[])
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(u.usd), 0) from public.ai_usage u
  where exists (select 1 from unnest(p_prefixes) p where starts_with(u.model, p))
$$;
revoke execute on function public.ai_spend_for_prefixes(text[]) from public, anon, authenticated;
grant execute on function public.ai_spend_for_prefixes(text[]) to service_role;
