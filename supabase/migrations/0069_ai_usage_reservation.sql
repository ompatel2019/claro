-- Rollback:
-- drop function public.record_reserved_ai_usage(uuid[],jsonb);
-- drop function public.reserve_ai_usage(uuid,text);
-- drop table public.ai_usage_reservations;
-- Deploy the previous app version with this rollback. ai_usage is unchanged.

-- Keep pending work out of every existing spend/call-count report.
create table public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('student', 'autofill')),
  expires_at timestamptz not null default (clock_timestamp() + interval '10 minutes')
);
create index ai_usage_reservations_user_idx on public.ai_usage_reservations(user_id);
alter table public.ai_usage_reservations enable row level security;
revoke all on public.ai_usage_reservations from public, anon, authenticated;
grant select, insert, delete on public.ai_usage_reservations to service_role;

create function public.reserve_ai_usage(p_user uuid, p_scope text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz;
  pending bigint;
  reservation uuid;
begin
  if p_user is null or p_scope not in ('student', 'autofill') or p_scope is null then
    raise exception 'Invalid AI reservation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 53));
  t := clock_timestamp();
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Unknown AI user';
  end if;
  -- Only the student minute/hour limiter has an admin exemption. The existing
  -- autofill daily cap also applies to admins.
  if p_scope = 'student' and exists (
    select 1 from public.profiles where id = p_user and role = 'admin'
  ) then
    return jsonb_build_object('ok', true, 'adminExempt', true);
  end if;
  delete from public.ai_usage_reservations where user_id = p_user and expires_at <= t;
  select count(*) into pending from public.ai_usage_reservations
    where user_id = p_user and scope = p_scope;
  if p_scope = 'student' then
    if pending + (select count(*) from public.ai_usage
      where user_id = p_user and created_at >= t - interval '1 minute') >= 20 then
      return jsonb_build_object('ok', false, 'retryAfterSec', 60);
    end if;
    if pending + (select count(*) from public.ai_usage
      where user_id = p_user and created_at >= t - interval '1 hour') >= 200 then
      return jsonb_build_object('ok', false, 'retryAfterSec', 3600);
    end if;
  elsif pending + (select count(*) from public.ai_usage
    where user_id = p_user and task = 'own-question-autofill'
      and created_at >= (date_trunc('day', t at time zone 'Australia/Sydney') at time zone 'Australia/Sydney')) >= 10 then
    return jsonb_build_object('ok', false, 'retryAfterSec', 86400);
  end if;
  insert into public.ai_usage_reservations(user_id, scope) values (p_user, p_scope)
    returning id into reservation;
  return jsonb_build_object('ok', true, 'reservationId', reservation);
end $$;

-- Log exactly the same completed usage as before, atomically replacing pending
-- capacity. Nested autofill settles only its daily slot: the enclosing student
-- marking allowance must remain reserved until marking usage replaces it.
create function public.record_reserved_ai_usage(p_reservations uuid[], p_usage jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  u uuid := (p_usage->>'user_id')::uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text, 53));
  insert into public.ai_usage(user_id, attempt_id, task, model, input_tokens, cached_tokens, output_tokens, usd)
    values (u, (p_usage->>'attempt_id')::uuid, p_usage->>'task', p_usage->>'model',
      (p_usage->>'input_tokens')::integer, (p_usage->>'cached_tokens')::integer,
      (p_usage->>'output_tokens')::integer, (p_usage->>'usd')::numeric);
  delete from public.ai_usage_reservations
    where id = any(p_reservations) and user_id = u
      and ((scope = 'student' and p_usage->>'task' <> 'own-question-autofill')
        or (scope = 'autofill' and p_usage->>'task' = 'own-question-autofill'));
end $$;

revoke all on function public.reserve_ai_usage(uuid,text) from public, anon, authenticated;
revoke all on function public.record_reserved_ai_usage(uuid[],jsonb) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid,text) to service_role;
grant execute on function public.record_reserved_ai_usage(uuid[],jsonb) to service_role;
