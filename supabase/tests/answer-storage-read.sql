-- Disposable local Postgres only. Confirms authenticated downloads retain owner access.
begin;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000231', '{}'),
  ('00000000-0000-4000-8000-000000000232', '{}');
insert into storage.objects (bucket_id, name) values
  ('answers', '00000000-0000-4000-8000-000000000231/00000000-0000-4000-8000-000000000233-1729000000000-0.png'),
  ('answers', '00000000-0000-4000-8000-000000000232/00000000-0000-4000-8000-000000000234-1729000000000-0.png');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000231', true);
set local role authenticated;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'answers' and name like '00000000-0000-4000-8000-000000000231/%') <> 1 then
    raise exception 'Owner must be able to read their uploaded answer';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'answers' and name like '00000000-0000-4000-8000-000000000232/%') then
    raise exception 'Other students answer objects must be invisible';
  end if;
end $$;
rollback;
