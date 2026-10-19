-- Run after 0054 on a disposable local Postgres, with psql -v ON_ERROR_STOP=1.
begin;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000701', '{}'),
  ('00000000-0000-4000-8000-000000000702', '{}'),
  ('00000000-0000-4000-8000-000000000703', '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000703';
insert into public.topics (id, parent_id, name, sort) values
  ('d7-topic', null, 'Synthetic D7 topic', 99),
  ('d7-moved-topic', null, 'Synthetic D7 moved topic', 99);
insert into public.flashcards (id, topic_id, kind, front, back, owner_id, origin, status) values
  ('d7-shared', 'd7-topic', 'term', 'Synthetic D7 shared', 'Synthetic answer', null, 'claro', 'live'),
  ('d7-a1', 'd7-topic', 'stat', 'Synthetic D7 A1', 'Synthetic answer', null, 'a1', 'live'),
  ('d7-outside', 'd7-topic', 'term', 'Synthetic D7 outside', 'Synthetic answer', null, 'claro', 'live'),
  ('d7-draft', 'd7-topic', 'term', 'Synthetic D7 draft', 'Synthetic answer', null, 'claro', 'draft'),
  ('d7-retired', 'd7-topic', 'term', 'Synthetic D7 retired', 'Synthetic answer', null, 'claro', 'retired'),
  ('d7-own', 'd7-topic', 'term', 'Synthetic D7 own', 'Synthetic answer', '00000000-0000-4000-8000-000000000701', 'student', 'live'),
  ('d7-private', 'd7-topic', 'term', 'Synthetic D7 private', 'Synthetic answer', '00000000-0000-4000-8000-000000000702', 'student', 'live');

insert into public.sessions (id, user_id, kind, config, finished_at) values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study","card_ids":["d7-shared","d7-a1","d7-own","d7-private","d7-draft","d7-retired"],"topics":["d7-topic"],"source":"both","which":"new"}', null),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"test","card_ids":["d7-shared","d7-own"]}', null),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000702', 'flashcards', '{"mode":"study","card_ids":["d7-shared","d7-private"]}', null),
  ('00000000-0000-4000-8000-000000000714', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study","card_ids":["d7-shared"]}', now()),
  ('00000000-0000-4000-8000-000000000715', '00000000-0000-4000-8000-000000000701', 'sprint', '{"mode":"study","card_ids":["d7-shared"]}', null),
  ('00000000-0000-4000-8000-000000000716', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"invalid","card_ids":["d7-shared"]}', null),
  ('00000000-0000-4000-8000-000000000717', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study"}', null),
  ('00000000-0000-4000-8000-000000000718', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study","card_ids":null}', null),
  ('00000000-0000-4000-8000-000000000719', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study","card_ids":{"d7-shared":true}}', null),
  ('00000000-0000-4000-8000-000000000720', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study","card_ids":"d7-shared"}', null),
  ('00000000-0000-4000-8000-000000000721', '00000000-0000-4000-8000-000000000701', 'flashcards', '{"mode":"study","card_ids":[["d7-shared"]]}', null),
  ('00000000-0000-4000-8000-000000000722', '00000000-0000-4000-8000-000000000703', 'flashcards', '{"mode":"study","card_ids":["d7-shared","d7-private"]}', null);

-- Invoker helper: only an RLS denial counts, never a missing column grant/FK error.
create function pg_temp.expect_review_denied(s uuid, card text, review_source text default 'self')
returns void language plpgsql as $$
begin
  begin
    insert into public.flashcard_reviews (session_id, flashcard_id, mark, source)
    values (s, card, 1, review_source);
  exception when insufficient_privilege then
    if sqlerrm not like '%row-level security%' then raise; end if;
    return;
  end;
  raise exception 'Review unexpectedly allowed: session %, card %, source %', s, card, review_source;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
set local role authenticated;
do $$
declare s uuid; card text; rating numeric; review_id uuid;
begin
  if not has_column_privilege(current_user, 'public.flashcards', 'id', 'select')
    or not has_column_privilege(current_user, 'public.flashcards', 'owner_id', 'select')
    or not has_table_privilege(current_user, 'public.sessions', 'select') then
    raise exception 'Policy subquery grants are missing';
  end if;
  if has_column_privilege(current_user, 'public.flashcards', 'origin', 'select')
    or has_column_privilege(current_user, 'public.flashcards', 'origin_ref', 'select') then
    raise exception 'Card origins must remain hidden';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'flashcard_reviews' and policyname = 'valid self review association'
    and permissive = 'RESTRICTIVE' and cmd = 'INSERT' and roles = array['authenticated']::name[]) then
    raise exception 'Association guard must be restrictive and authenticated INSERT only';
  end if;
  -- Both modes, shared/personal cards, every rating, typed/spoken, and repeats.
  for s in select unnest(array['00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000712']::uuid[]) loop
    foreach card in array array['d7-shared', 'd7-own'] loop
      foreach rating in array array[0, 0.5, 1]::numeric[] loop
        insert into public.flashcard_reviews (session_id, flashcard_id, answer, answer_mode, mark, source)
        values (s, card, 'Synthetic rating', case when rating = 0 then 'spoken' else 'typed' end, rating, 'self')
        returning id into review_id;
        if not exists (select 1 from public.flashcard_reviews where id = review_id and user_id = auth.uid()) then
          raise exception 'Review RETURNING/owner default failed';
        end if;
      end loop;
    end loop;
  end loop;
  -- Hidden origin is not a filter: A1 shared cards are legitimate too.
  insert into public.flashcard_reviews (session_id, flashcard_id, mark, source)
  values ('00000000-0000-4000-8000-000000000711', 'd7-a1', 1, 'self');
  -- A personal card can be moved/retired while its original session stays open.
  update public.flashcards set topic_id = 'd7-moved-topic', status = 'retired' where id = 'd7-own';
  insert into public.flashcard_reviews (session_id, flashcard_id, mark, source)
  values ('00000000-0000-4000-8000-000000000711', 'd7-own', 0.5, 'self');

  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-outside');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-private');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-draft');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-retired');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-shared', 'ai');
  perform pg_temp.expect_review_denied(null, 'd7-shared');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000799', 'd7-shared');
  -- Foreign, finished, wrong kind/mode and malformed card lists.
  for s in select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(713, 721) n loop
    perform pg_temp.expect_review_denied(s, 'd7-shared');
  end loop;
end $$;

-- The second student can use their own deck, but cannot append to the first's.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);
do $$
begin
  insert into public.flashcard_reviews (session_id, flashcard_id, mark, source)
  values ('00000000-0000-4000-8000-000000000713', 'd7-private', 1, 'self');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-shared');
end $$;

-- Admin read access must not bypass the explicit session/card ownership checks.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000703', true);
do $$
begin
  insert into public.flashcard_reviews (session_id, flashcard_id, mark, source)
  values ('00000000-0000-4000-8000-000000000722', 'd7-shared', 1, 'self');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000711', 'd7-shared');
  perform pg_temp.expect_review_denied('00000000-0000-4000-8000-000000000722', 'd7-private');
end $$;

-- Mark route writes use service_role, including standalone self/AI matches and overrides.
reset role;
set local role service_role;
insert into public.flashcard_reviews (user_id, session_id, flashcard_id, answer, answer_mode, mark, source) values
  ('00000000-0000-4000-8000-000000000701', null, 'd7-shared', 'Synthetic match', 'typed', 1, 'self'),
  ('00000000-0000-4000-8000-000000000701', null, 'd7-shared', 'Synthetic answer', 'spoken', 0.5, 'ai'),
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000712', 'd7-shared', 'Synthetic answer', 'typed', 0, 'ai');
do $$
declare changed int;
begin
  update public.flashcard_reviews set mark = 1, source = 'self', reason = 'Synthetic override'
  where session_id = '00000000-0000-4000-8000-000000000712' and source = 'ai';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Service override failed'; end if;
  if (select count(*) from public.flashcard_reviews where session_id is null and flashcard_id = 'd7-shared') <> 2 then
    raise exception 'Service standalone inserts failed';
  end if;
end $$;
rollback;
