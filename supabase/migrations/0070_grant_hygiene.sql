-- Requires Om/master sign-off before production application.
-- Privilege hygiene only (KILL_LIST D8 / SEC-08); no object, data or behaviour change.

-- Trigger and event-trigger functions are never called directly. Triggers fire
-- regardless of the caller's EXECUTE privilege, so remove the default PUBLIC grant.
revoke execute on function public.bump_answer_version() from public, anon, authenticated;
revoke execute on function public.guard_review_answer_version() from public, anon, authenticated;
-- rls_auto_enable() is created by the Supabase platform (ensure_rls event trigger),
-- not by these migrations, so it may be absent on a fresh database.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

-- One-off rollback backup (not created by these migrations): service role only.
do $$
begin
  if to_regclass('public.questions_criteria_backup_20261019') is not null then
    revoke all on table public.questions_criteria_backup_20261019 from public, anon, authenticated;
  end if;
end
$$;

-- Views are read-only; TRUNCATE and TRIGGER grants are meaningless for clients.
-- Guarded per view so this stays valid if a later cleanup drops one (E2/E3).
do $$
declare v text;
begin
  foreach v in array array['review_queue', 'score_history', 'topic_progress',
    'student_mark_reviews', 'marking_examples_for_grader'] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke truncate, trigger on public.%I from public, anon, authenticated', v);
    end if;
  end loop;
end
$$;
