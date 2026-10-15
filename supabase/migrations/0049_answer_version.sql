-- Requires Om/master sign-off before production application.
-- Constant defaults need no backfill; old callers can ignore both columns.
alter table public.attempts add column if not exists answer_version integer not null default 0;
alter table public.mark_reviews add column if not exists answer_version integer;

create or replace function public.bump_answer_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.answer_version := old.answer_version;
  if row(new.answer_text, new.transcript, new.choice_index, new.image_paths)
    is distinct from row(old.answer_text, old.transcript, old.choice_index, old.image_paths) then
    new.answer_version := coalesce(old.answer_version, 0) + 1;
  end if;
  return new;
end $$;
drop trigger if exists attempts_answer_version on public.attempts;
create trigger attempts_answer_version before update on public.attempts
for each row execute function public.bump_answer_version();

-- Lock the answer through the insert: no check/insert gap or stale open-review conflict.
-- Null versions preserve inserts by old workers during rollout.
create or replace function public.guard_review_answer_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  if new.reason <> 'check_disagreed' or new.answer_version is null then return new; end if;
  select coalesce(answer_version, 0) into v from public.attempts
    where id = new.attempt_id for update;
  if v is distinct from new.answer_version then return null; end if;
  delete from public.mark_reviews where attempt_id = new.attempt_id
    and reason = 'check_disagreed' and status = 'open'
    and coalesce(answer_version, 0) < v;
  return new;
end $$;
drop trigger if exists mark_reviews_answer_version on public.mark_reviews;
create trigger mark_reviews_answer_version before insert on public.mark_reviews
for each row execute function public.guard_review_answer_version();

-- Service-only: use the same answer locks as finalization, then recheck session-open.
create or replace function public.save_sprint_answer(
  p_id uuid, p_user uuid, p_version integer, p_status text, p_patch jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare a public.attempts; s public.sessions; n public.attempts;
begin
  select * into a from public.attempts where id = p_id and user_id = p_user for update;
  if not found or coalesce(a.answer_version, 0) <> p_version or a.status <> p_status then return false; end if;
  select * into s from public.sessions where id = a.session_id for update;
  if s.finished_at is not null or s.kind <> 'sprint' or s.config->>'feedback' = 'each'
    or not exists (select 1 from public.questions where id = a.question_id and type <> 'mcq') then
    return false;
  end if;
  n := jsonb_populate_record(a, p_patch);
  update public.attempts set answer_text = n.answer_text, transcript = n.transcript,
    image_paths = n.image_paths, flagged = n.flagged, status = n.status,
    claimed_at = n.claimed_at, mark = n.mark, max_marks = n.max_marks, band = n.band,
    feedback = n.feedback, marked_at = n.marked_at, check_status = n.check_status,
    marked_by_model = n.marked_by_model
  where id = p_id and coalesce(answer_version, 0) = p_version;
  if not found then return false; end if;
  delete from public.mark_reviews where attempt_id = p_id
    and reason = 'check_disagreed' and status = 'open'
    and coalesce(answer_version, 0) < (select answer_version from public.attempts where id = p_id);
  return true;
end $$;
revoke all on function public.save_sprint_answer(uuid, uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_sprint_answer(uuid, uuid, integer, text, jsonb) to service_role;

-- Compare the complete scored snapshot while holding answer locks through commit.
-- A concurrent edit either wins first (retry) or sees the finished session (reject).
create or replace function public.finish_versioned_session(
  p_id uuid, p_answers jsonb, p_result jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_answers jsonb; s public.sessions;
begin
  perform id from public.attempts where session_id = p_id order by id for update;
  select coalesce(jsonb_object_agg(id::text, jsonb_build_array(
    coalesce(answer_version, 0), status, mark, marked_at)), '{}'::jsonb)
    into current_answers from public.attempts where session_id = p_id;
  if current_answers <> p_answers then return null; end if;
  select * into s from public.sessions where id = p_id for update;
  if s.finished_at is not null then return to_jsonb(s); end if;
  update public.sessions set finished_at = now(), score = (p_result->>'score')::numeric,
    max_score = (p_result->>'max_score')::numeric, summary = nullif(p_result->'summary', 'null'::jsonb)
    where id = p_id returning * into s;
  return to_jsonb(s);
end $$;
revoke all on function public.finish_versioned_session(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_versioned_session(uuid, jsonb, jsonb) to service_role;
