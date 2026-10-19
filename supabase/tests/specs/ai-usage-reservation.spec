# LOCAL ONLY after 0069. Two genuinely concurrent transactions compete for the
# final minute slot and the final autofill slot. The loser must wait, then deny.
setup
{
  insert into auth.users(id) values ('d4000000-0000-4000-8000-000000000003');
  insert into public.ai_usage(user_id,task,model,input_tokens,output_tokens,usd)
    select 'd4000000-0000-4000-8000-000000000003', 'synthetic','synthetic',0,0,0 from generate_series(1,19);
}
teardown
{
  delete from public.ai_usage where user_id = 'd4000000-0000-4000-8000-000000000003';
  delete from auth.users where id = 'd4000000-0000-4000-8000-000000000003';
}

session "first"
step "begin_first" { begin; set local role service_role; }
step "reserve_first" { select public.reserve_ai_usage('d4000000-0000-4000-8000-000000000003', 'student')->>'ok' as allowed; }
step "commit_first" { commit; }
step "begin_daily" { begin; set local role service_role; }
step "reserve_daily" { select public.reserve_ai_usage('d4000000-0000-4000-8000-000000000003', 'autofill')->>'ok' as allowed; }
step "commit_daily" { commit; }

session "second"
step "reserve_second" { select public.reserve_ai_usage('d4000000-0000-4000-8000-000000000003', 'student') as refused; }
step "reserve_second_daily" { select public.reserve_ai_usage('d4000000-0000-4000-8000-000000000003', 'autofill') as refused; }

session "check"
step "check_minute"
{
  do $$ begin
    if (select count(*) from public.ai_usage_reservations where user_id = 'd4000000-0000-4000-8000-000000000003' and scope = 'student') <> 1
    then raise exception 'Concurrent reservations exceeded the minute limit'; end if;
  end $$;
}
step "seed_daily"
{
  insert into public.ai_usage(user_id,task,model,input_tokens,output_tokens,usd)
    select 'd4000000-0000-4000-8000-000000000003','own-question-autofill','synthetic',0,0,0 from generate_series(1,9);
}
step "check_daily"
{
  do $$ begin
    if (select count(*) from public.ai_usage_reservations where user_id = 'd4000000-0000-4000-8000-000000000003' and scope = 'autofill') <> 1
    then raise exception 'Concurrent reservations exceeded the daily limit'; end if;
  end $$;
}

permutation "begin_first" "reserve_first" "reserve_second" "commit_first" "check_minute" "seed_daily" "begin_daily" "reserve_daily" "reserve_second_daily" "commit_daily" "check_daily"
