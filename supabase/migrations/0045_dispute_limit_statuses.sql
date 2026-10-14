-- Dispute limits (3 open, 5 a Sydney week, 48h cooldown) return 429 so callers can tell them from a 409 duplicate. create or replace only.
create or replace function public.request_mark_review(p_attempt uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_attempt public.attempts;
  v_week timestamptz := date_trunc('week', now() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney';
begin
  if v_user is null then return jsonb_build_object('error', 'Unauthorised', 'status', 401); end if;
  p_note := regexp_replace(p_note, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if p_note is null or char_length(p_note) not between 10 and 1000 then
    return jsonb_build_object('error', 'Tell us what we missed in 10 to 1,000 characters.', 'status', 400);
  end if;
  perform id from public.profiles where id = v_user for update;
  select a.* into v_attempt from public.attempts a where a.id = p_attempt and a.user_id = v_user for update;
  if not found then return jsonb_build_object('error', 'Attempt not found', 'status', 404); end if;
  if exists (select 1 from public.mark_reviews where attempt_id = p_attempt and reason = 'student_dispute') then
    return jsonb_build_object('error', 'You have already questioned this mark.', 'status', 409);
  end if;
  if v_attempt.status <> 'marked' or v_attempt.check_status not in ('agreed', 'reviewed', 'skipped', 'second_pass')
    or v_attempt.feedback->>'note' = 'No answer'
    or not exists (select 1 from public.sessions where id = v_attempt.session_id and finished_at is not null)
    or exists (select 1 from public.questions where id = v_attempt.question_id and type = 'mcq') then
    return jsonb_build_object('error', 'This mark can’t be questioned right now.', 'status', 409);
  end if;
  if exists (select 1 from public.mark_reviews where attempt_id = p_attempt and status = 'open') then
    return jsonb_build_object('error', 'This mark is already being checked.', 'status', 409);
  end if;
  if (select count(*) from public.mark_reviews where user_id = v_user and reason = 'student_dispute' and status = 'open') >= 3 then
    return jsonb_build_object('error', 'You have 3 marks being checked. You can question another once one is done.', 'status', 429);
  end if;
  if (select count(*) from public.mark_reviews where user_id = v_user and reason = 'student_dispute' and created_at >= v_week) >= 5 then
    return jsonb_build_object('error', 'You can question up to 5 marks per Sydney week. Try again next Monday.', 'status', 429);
  end if;
  if exists (select 1 from public.mark_reviews where user_id = v_user and reason = 'student_dispute' and status = 'resolved'
    and final_mark <= ai_mark and resolved_at > now() - interval '48 hours') then
    return jsonb_build_object('error', 'Wait 48 hours after an unchanged or lowered review before questioning another mark.', 'status', 429);
  end if;
  insert into public.mark_reviews(attempt_id,user_id,reason,ai_mark,student_note)
    values(p_attempt,v_user,'student_dispute',v_attempt.mark,p_note);
  update public.attempts set check_status = 'in_review' where id = p_attempt;
  return jsonb_build_object('ok', true);
end;
$$;
