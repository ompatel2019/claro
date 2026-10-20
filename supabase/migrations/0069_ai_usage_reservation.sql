-- Rollback:
-- drop function public.reserve_ai_sprint(uuid,uuid);
-- drop function public.session_needs_ai_finish(uuid,uuid);
-- drop function public.record_reserved_ai_usage(uuid[],jsonb);
-- drop function public.reserve_ai_usage(uuid,text);
-- drop table public.ai_usage_reservations;
-- Deploy the previous app version with this rollback. ai_usage is unchanged.

-- Keep pending work out of every existing spend/call-count report.
create table public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('student', 'autofill', 'sprint')),
  session_id uuid references public.sessions(id) on delete cascade,
  check ((scope = 'sprint') = (session_id is not null)),
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

-- Match the former needsAiFinish JS predicate without returning answer bodies.
-- p_user preserves the initial owned-attempt filter; historical counts retain
-- the old session-based join. Retired questions remain visible to the engine.
create function public.session_needs_ai_finish(p_session uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  with settings as (select U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' as whitespace)
  select exists (
    select 1 from public.attempts a join public.questions q on q.id = a.question_id
      cross join settings
    where a.session_id = p_session and (p_user is null or a.user_id = p_user) and q.type <> 'mcq'
      and case when a.status = 'marked' then
        a.feedback->>'note' is distinct from 'No answer'
        and length(btrim(coalesce(a.transcript, a.answer_text, ''), whitespace)) > 0
      else coalesce(a.transcript, a.answer_text, '') ~
        ('[^' || whitespace || ']+[' || whitespace || ']+[^' || whitespace || ']+[' || whitespace || ']+[^' || whitespace || ']+')
      end
  );
$$;
revoke all on function public.session_needs_ai_finish(uuid,uuid) from public, anon, authenticated;
grant execute on function public.session_needs_ai_finish(uuid,uuid) to service_role;

-- Daily sprint capacity is held until Finish exits, never settled by an
-- individual provider usage row. Count sessions once, including pending finishes
-- for distinct sessions, using the same snapshot for completion and pending work.
create function public.reserve_ai_sprint(p_user uuid, p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz;
  midnight timestamptz;
  reservation uuid;
  finished timestamptz;
  used bigint;
begin
  if p_user is null or p_session is null then raise exception 'Invalid sprint reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 53));
  t := clock_timestamp();
  midnight := date_trunc('day', t at time zone 'Australia/Sydney') at time zone 'Australia/Sydney';
  select finished_at into finished from public.sessions
    where id = p_session and user_id = p_user and kind = 'sprint' for no key update;
  if not found then raise exception 'Unknown sprint'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    return jsonb_build_object('ok', true, 'adminExempt', true);
  end if;
  if finished is not null then return jsonb_build_object('ok', true, 'alreadyFinished', true); end if;
  delete from public.ai_usage_reservations where user_id = p_user and expires_at <= t;
  select
    (select count(*) from public.sessions s
      where s.user_id = p_user and s.kind = 'sprint' and s.finished_at >= midnight
        and public.session_needs_ai_finish(s.id))
    + (select count(distinct r.session_id) from public.ai_usage_reservations r
        join public.sessions s on s.id = r.session_id
        where r.user_id = p_user and r.scope = 'sprint'
          and r.session_id <> p_session and s.finished_at is null)
    into used;
  -- Concurrent retries of the same session share capacity, but each owns its
  -- own reservation so one request's cleanup cannot release another's slot.
  if used >= 200 then return jsonb_build_object('ok', false, 'retryAfterSec', 86400); end if;
  insert into public.ai_usage_reservations(user_id, scope, session_id)
    values (p_user, 'sprint', p_session) returning id into reservation;
  return jsonb_build_object('ok', true, 'reservationId', reservation);
end $$;
revoke all on function public.reserve_ai_sprint(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_sprint(uuid,uuid) to service_role;
