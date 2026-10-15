# LOCAL ONLY, after 0049, with claro.test_student_id set to a synthetic profile.
# Run pg_isolation_regress --use-existing --inputdir=supabase/tests
# --outputdir=/tmp/answer-lock-results answer-version-locks with PGHOST/PGPORT,
# PGUSER/PGDATABASE and PGOPTIONS pointing ONLY to a disposable local cluster.
# The legacy insert pauses after its unique-index entry and before its FK check.
# FOR UPDATE in the review guard deadlocks; NO KEY UPDATE permits the FK check,
# leaving only the expected duplicate-key error for the versioned insert.
setup
{
  insert into public.topics(id,name,sort) values ('answer-lock-test','Synthetic locks',999);
  insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,origin,status)
    values ('answer-lock-test','short','answer-lock-test',4,'Synthetic','[]','Synthetic',2026,'claro','live');
  insert into public.sessions(id,user_id,kind,config)
    values ('10000000-0000-0000-0000-000000000002',current_setting('claro.test_student_id')::uuid,'sprint',jsonb_build_object('feedback','end'));
  insert into public.attempts(id,user_id,session_id,question_id,position)
    values ('20000000-0000-0000-0000-000000000002',current_setting('claro.test_student_id')::uuid,'10000000-0000-0000-0000-000000000002','answer-lock-test',1);
  create function public.pause_test_legacy_review() returns trigger language plpgsql as $$
  begin
    if new.answer_version is null then perform pg_advisory_xact_lock(424242); end if;
    return new;
  end $$;
  create trigger "A_pause_test_legacy_review" after insert on public.mark_reviews
    for each row execute function public.pause_test_legacy_review();
}
teardown
{
  drop trigger "A_pause_test_legacy_review" on public.mark_reviews;
  drop function public.pause_test_legacy_review();
  delete from public.sessions where id = '10000000-0000-0000-0000-000000000002';
  delete from public.questions where id = 'answer-lock-test';
  delete from public.topics where id = 'answer-lock-test';
}

session "control"
step "pause" { do $$ begin perform pg_advisory_lock(424242); end $$; }
step "resume" { do $$ begin perform pg_advisory_unlock(424242); end $$; }
step "check" { do $$ begin if (select count(*) from public.mark_reviews where attempt_id = '20000000-0000-0000-0000-000000000002' and answer_version is null) <> 1 then raise exception 'Legacy review must win'; end if; end $$; }

session "legacy"
step "legacy_insert" { insert into public.mark_reviews(attempt_id,user_id,reason) values ('20000000-0000-0000-0000-000000000002',current_setting('claro.test_student_id')::uuid,'check_disagreed'); }

session "versioned"
step "versioned_insert" { insert into public.mark_reviews(attempt_id,user_id,reason,answer_version) values ('20000000-0000-0000-0000-000000000002',current_setting('claro.test_student_id')::uuid,'check_disagreed',0); }

permutation "pause" "legacy_insert" "versioned_insert" "resume" "check"
