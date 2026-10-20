begin;
insert into auth.users (id) values ('c2000000-0000-0000-0000-000000000002');
insert into public.topics (id, name, sort) values ('c2-card', 'SQL flashcard test', 999);
insert into public.flashcards (id, topic_id, kind, front, back, origin, origin_ref)
  values ('c2-card', 'c2-card', 'term', 'SQL fixture front', 'SQL fixture back', 'a1', 'Private provenance');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000002', true);
do $$
declare
  col record;
  value jsonb;
begin
  if (select count(*) from public.flashcards where id = 'c2-card') <> 1 then
    raise exception 'authenticated cannot read shared live flashcards';
  end if;
  for col in select attname from pg_attribute
    where attrelid = 'public.flashcards'::regclass and attnum > 0 and not attisdropped loop
    if col.attname in ('origin', 'origin_ref') then
      begin
        execute format('select to_jsonb(%I) from public.flashcards where id = $1', col.attname) into value using 'c2-card';
        raise exception 'authenticated can select private flashcards.%', col.attname;
      exception when insufficient_privilege then null;
      end;
    else
      if not has_column_privilege(current_user, 'public.flashcards', col.attname, 'select') then
        raise exception 'authenticated lost SELECT on flashcards.%', col.attname;
      end if;
      execute format('select to_jsonb(%I) from public.flashcards where id = $1', col.attname) into value using 'c2-card';
      if col.attname = 'front' and value is distinct from '"SQL fixture front"'::jsonb then
        raise exception 'flashcard front must remain readable';
      end if;
    end if;
  end loop;
end $$;
rollback;
