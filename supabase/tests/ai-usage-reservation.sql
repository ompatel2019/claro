-- Disposable local Postgres only, after 0069. Synthetic data, no remote access.
begin;
insert into auth.users(id) values ('d4000000-0000-4000-8000-000000000001'), ('d4000000-0000-4000-8000-000000000002');
update public.profiles set role = 'admin' where id = 'd4000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
begin
  begin
    perform public.reserve_ai_usage(auth.uid(), 'student');
    raise exception 'Authenticated caller must not reserve';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_reserved_ai_usage('{}', '{}');
    raise exception 'Authenticated caller must not write usage';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.ai_usage_reservations;
    raise exception 'Authenticated caller must not read reservations';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
declare
  u uuid := 'd4000000-0000-4000-8000-000000000001';
  a uuid := 'd4000000-0000-4000-8000-000000000002';
  r jsonb; d jsonb; i integer; midnight timestamptz;
begin
  if has_function_privilege('anon','public.reserve_ai_usage(uuid,text)','execute')
    or has_function_privilege('anon','public.record_reserved_ai_usage(uuid[],jsonb)','execute')
    or not has_function_privilege('service_role','public.reserve_ai_usage(uuid,text)','execute') then
    raise exception 'RPC ACL regression';
  end if;
  for i in 1..20 loop
    r := public.reserve_ai_usage(u, 'student');
    if not (r->>'ok')::boolean then raise exception 'Must allow first 20'; end if;
  end loop;
  r := public.reserve_ai_usage(u, 'student');
  if r <> '{"ok":false,"retryAfterSec":60}'::jsonb then raise exception 'Must block 21st: %', r; end if;
  if exists (select 1 from public.ai_usage where user_id = u) then raise exception 'Reservations must not affect spend reports'; end if;
  -- Release and expiry both restore capacity, without touching usage.
  delete from public.ai_usage_reservations where id = (select id from public.ai_usage_reservations where user_id = u limit 1);
  r := public.reserve_ai_usage(u, 'student');
  if not (r->>'ok')::boolean then raise exception 'Release must restore capacity'; end if;
  update public.ai_usage_reservations set expires_at = clock_timestamp() - interval '1 second' where user_id = u;
  r := public.reserve_ai_usage(u, 'student');
  if not (r->>'ok')::boolean or (select count(*) from public.ai_usage_reservations where user_id = u) <> 1 then
    raise exception 'Expired reservations must not block';
  end if;
  d := public.reserve_ai_usage(u, 'autofill');
  perform public.record_reserved_ai_usage(array[(r->>'reservationId')::uuid,(d->>'reservationId')::uuid],
    jsonb_build_object('user_id',u,'attempt_id',null,'task','own-question-autofill','model','synthetic',
      'input_tokens',123,'cached_tokens',23,'output_tokens',45,'usd',0.012345));
  if not exists (select 1 from public.ai_usage_reservations where id = (r->>'reservationId')::uuid)
    or exists (select 1 from public.ai_usage_reservations where id = (d->>'reservationId')::uuid) then
    raise exception 'Nested autofill must settle its daily slot and preserve the marking slot';
  end if;
  perform public.record_reserved_ai_usage(array[(r->>'reservationId')::uuid],
    jsonb_build_object('user_id',u,'attempt_id',null,'task','mark-written','model','synthetic',
      'input_tokens',1,'cached_tokens',0,'output_tokens',1,'usd',0));
  if exists (select 1 from public.ai_usage_reservations where user_id = u) then
    raise exception 'Marking usage must settle the preserved student slot';
  end if;
  delete from public.ai_usage where user_id = u and task = 'mark-written';
  if not exists (select 1 from public.ai_usage where user_id = u and input_tokens = 123 and cached_tokens = 23
    and output_tokens = 45 and usd = 0.012345 and task = 'own-question-autofill') then raise exception 'Accounting must be identical'; end if;
  for i in 1..19 loop
    r := public.reserve_ai_usage(u, 'student');
    if not (r->>'ok')::boolean then raise exception 'Completed + pending must admit 20 total'; end if;
  end loop;
  if (public.reserve_ai_usage(u, 'student')->>'ok')::boolean then raise exception 'Completed + pending must block 21st'; end if;
  delete from public.ai_usage_reservations where user_id = u;
  delete from public.ai_usage where user_id = u;
  insert into public.ai_usage(user_id,task,model,input_tokens,output_tokens,usd,created_at)
    select u,'synthetic','synthetic',0,0,0,clock_timestamp() - interval '2 minutes' from generate_series(1,199);
  r := public.reserve_ai_usage(u, 'student');
  if not (r->>'ok')::boolean then raise exception 'Must allow 200th hourly'; end if;
  r := public.reserve_ai_usage(u, 'student');
  if r <> '{"ok":false,"retryAfterSec":3600}'::jsonb then raise exception 'Must block 201st hourly: %', r; end if;
  delete from public.ai_usage_reservations where user_id = u;
  -- An admin remains exempt, regardless of usage or pending calls.
  for i in 1..21 loop
    if public.reserve_ai_usage(a, 'student') <> '{"ok":true,"adminExempt":true}'::jsonb then raise exception 'Admin must be exempt'; end if;
  end loop;
  -- Sydney day boundary: yesterday's autofill and today's other tasks do not count.
  midnight := date_trunc('day', clock_timestamp() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney';
  insert into public.ai_usage(user_id,task,model,input_tokens,output_tokens,usd,created_at)
    select u,'own-question-autofill','synthetic',0,0,0,midnight - interval '1 second' from generate_series(1,10);
  for i in 1..10 loop
    r := public.reserve_ai_usage(u, 'autofill');
    if not (r->>'ok')::boolean then raise exception 'Must allow 10 autofill reservations'; end if;
  end loop;
  r := public.reserve_ai_usage(u, 'autofill');
  if r <> '{"ok":false,"retryAfterSec":86400}'::jsonb then raise exception 'Must block 11th autofill: %', r; end if;
  -- The daily autofill cap was never admin-exempt.
  for i in 1..10 loop perform public.reserve_ai_usage(a, 'autofill'); end loop;
  if (public.reserve_ai_usage(a, 'autofill')->>'ok')::boolean then raise exception 'Admin daily cap must stay unchanged'; end if;
end $$;
-- Regression: fallback autofill at 19 minute / 199 hourly completed calls
-- reuses the route slot, and never releases that slot before marking starts.
do $$
declare
  u uuid := 'd4000000-0000-4000-8000-000000000001';
  r jsonb; d jsonb; window_seconds integer; completed integer;
begin
  foreach window_seconds in array array[60,3600] loop
    delete from public.ai_usage_reservations where user_id = u;
    delete from public.ai_usage where user_id = u;
    completed := case when window_seconds = 60 then 19 else 199 end;
    insert into public.ai_usage(user_id,task,model,input_tokens,output_tokens,usd,created_at)
      select u,'synthetic','synthetic',0,0,0,
        clock_timestamp() - case when window_seconds = 60 then interval '0 seconds' else interval '2 minutes' end
      from generate_series(1,completed);
    r := public.reserve_ai_usage(u, 'student');
    d := public.reserve_ai_usage(u, 'autofill');
    if not (r->>'ok')::boolean or not (d->>'ok')::boolean then
      raise exception 'Final student slot plus independent daily slot must be allowed';
    end if;
    perform public.record_reserved_ai_usage(array[(r->>'reservationId')::uuid,(d->>'reservationId')::uuid],
      jsonb_build_object('user_id',u,'attempt_id',null,'task','own-question-autofill','model','synthetic',
        'input_tokens',1,'cached_tokens',0,'output_tokens',1,'usd',0));
    if not exists (select 1 from public.ai_usage_reservations where id = (r->>'reservationId')::uuid)
      or exists (select 1 from public.ai_usage_reservations where id = (d->>'reservationId')::uuid) then
      raise exception 'Autofill consumed the enclosing marking reservation';
    end if;
    if (public.reserve_ai_usage(u, 'student')->>'ok')::boolean then
      raise exception 'Unrelated work must not bypass an active marking reservation';
    end if;
    -- The existing marking operation proceeds using its slot, without reserving again.
    perform public.record_reserved_ai_usage(array[(r->>'reservationId')::uuid],
      jsonb_build_object('user_id',u,'attempt_id',null,'task','mark-written','model','synthetic',
        'input_tokens',1,'cached_tokens',0,'output_tokens',1,'usd',0));
    if exists (select 1 from public.ai_usage_reservations where user_id = u) then
      raise exception 'Completed fallback marking must settle its slot';
    end if;
    if (select count(*) from public.ai_usage where user_id = u) <> completed + 2 then
      raise exception 'Autofill and marking must each keep their completed usage';
    end if;
  end loop;
end $$;
-- Exercise the actual service-role grants, not just the owner.
set local role service_role;
select public.reserve_ai_usage('d4000000-0000-4000-8000-000000000002', 'student');
rollback;
