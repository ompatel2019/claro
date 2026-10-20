# LOCAL ONLY after 0069. At 199 completed AI sprints, two different sessions
# compete for the final slot. Exercise both pending and completed winners.
setup
{
  insert into auth.users(id) values ('d4000000-0000-4000-8000-000000000073');
  insert into public.questions(id,type,topic_id,marks,stem,criteria,source,year,status)
    values ('d4-isolation-short','short','t1',5,'Synthetic question','[]','Synthetic',2026,'live');
  insert into public.sessions(id,user_id,kind,finished_at)
    select md5('d4-isolation-'||i)::uuid,'d4000000-0000-4000-8000-000000000073','sprint',
      case when i <= 199 then now() end from generate_series(1,201) i;
  insert into public.attempts(user_id,session_id,question_id,position,status,answer_text)
    select user_id,id,'d4-isolation-short',1,'marked','Synthetic answer' from public.sessions
      where user_id='d4000000-0000-4000-8000-000000000073';
}
teardown
{
  delete from auth.users where id='d4000000-0000-4000-8000-000000000073';
  delete from public.questions where id='d4-isolation-short';
}

session "first"
step "begin_first" { begin; set local role service_role; }
step "reserve_first" { select public.reserve_ai_sprint('d4000000-0000-4000-8000-000000000073',md5('d4-isolation-200')::uuid)->>'ok' as allowed; }
step "finish_first" { update public.sessions set finished_at=now() where id=md5('d4-isolation-200')::uuid; }
step "commit_first" { commit; }

session "second"
step "begin_second" { begin; set local role service_role; }
step "reserve_second" { select public.reserve_ai_sprint('d4000000-0000-4000-8000-000000000073',md5('d4-isolation-201')::uuid) as refused; }
step "commit_second" { commit; }

session "check"
step "check_capacity"
{
  do $$ begin
    if (select count(*) from public.ai_usage_reservations where user_id='d4000000-0000-4000-8000-000000000073' and scope='sprint') <> 1
      or (select count(*) from public.sessions where user_id='d4000000-0000-4000-8000-000000000073' and finished_at is not null) > 200
    then raise exception 'Concurrent finishes exceeded daily capacity'; end if;
  end $$;
}

permutation "begin_first" "begin_second" "reserve_first" "reserve_second" "commit_first" "commit_second" "check_capacity"
permutation "begin_first" "begin_second" "reserve_first" "reserve_second" "finish_first" "commit_first" "commit_second" "check_capacity"
