begin;
insert into auth.users (id) values
  ('c2000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000002');
update public.profiles set role = 'admin' where id = 'c2000000-0000-0000-0000-000000000001';
insert into public.topics (id, parent_id, name, sort) values
  ('c2-parent', null, 'SQL test parent', 999),
  ('c2-child', 'c2-parent', 'SQL test child', 999),
  ('c2-other', null, 'SQL test other', 999);
insert into public.questions (id, type, topic_id, marks, stem, criteria, source, year, status, options, correct_index) values
  ('c2-0-retired', 'short', 'c2-child', 4, 'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar nova', '[]', 'Retired', 2024, 'retired', null, null),
  ('c2-1-low', 'short', 'c2-child', 4, 'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar comet', '[]', 'Lower score', 2024, 'live', null, null),
  ('c2-a-win', 'mcq', 'c2-child', 4, 'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar nova', null, 'MatchToken', 2024, 'live', array['a','b','c','d'], 0),
  ('c2-z-tie', 'extended', 'c2-child', 4, 'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar nova', '[]', 'Tie', 2024, 'live', null, null),
  ('c2-best', 'short', 'c2-child', 4, 'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar nova', '[]', 'DraftToken', 2024, 'draft', null, null),
  ('c2-mcq', 'mcq', 'c2-other', 2, 'Walrus flippers arctic tundra icicle', null, 'MCQ source', 2020, 'draft', array['a','b','c','d'], 0),
  ('c2-complete', 'extended', 'c2-other', 8, 'Saffron cardamom nutmeg cinnamon', '[{"min":0,"max":8,"descriptor":"test"}]', 'Complete source', 2026, 'draft', null, null),
  ('c2-self', 'short', 'c2-other', 1, 'Unique self duplicate', '[]', 'Self', 2026, 'draft', null, null),
  ('c2-threshold-live', 'short', 'c2-other', 4, 'Mitochondria cytoplasm ribosome nucleus membrane enzyme protein', '[]', 'Threshold live', 2026, 'live', null, null),
  ('c2-threshold', 'short', 'c2-other', 4, 'Mitochondria cytoplasm ribosome nucleus membrane enzyme peptide', '[]', 'Threshold draft', 2026, 'draft', null, null);
update public.questions set origin = 'a1', stimulus = 'A stimulus' where id = 'c2-best';
update public.questions set duplicate_of = 'c2-0-retired', explanation = '  ' where id = 'c2-mcq';
update public.questions set duplicate_of = 'c2-0-retired', sample_answer = 'Sample', explanation = 'Explanation' where id = 'c2-complete';
update public.questions set duplicate_of = id where id = 'c2-self';
-- Papers exist until E6 (0077) drops them; afterwards the paper filter is yes = none, no = all.
do $$
begin
  if to_regclass('public.papers') is null then return; end if;
  execute $sql$
    insert into public.papers (id, title, status) values
      ('c2000000-0000-0000-0000-000000000011', 'Live test paper', 'live'),
      ('c2000000-0000-0000-0000-000000000012', 'Draft test paper', 'draft'),
      ('c2000000-0000-0000-0000-000000000013', 'Retired test paper', 'retired');
    insert into public.paper_questions (paper_id, position, question_id) values
      ('c2000000-0000-0000-0000-000000000011', 1, 'c2-best'),
      ('c2000000-0000-0000-0000-000000000012', 1, 'c2-mcq'),
      ('c2000000-0000-0000-0000-000000000013', 1, 'c2-complete')
  $sql$;
end $$;

do $$
declare
  threshold double precision;
  s double precision;
  pair record;
  c record;
  actual text[];
  expected text[];
begin
  if exists (select 1 from pg_proc
    where oid in ('public.question_import_review(double precision,jsonb)'::regprocedure,
      'public.admin_dashboard()'::regprocedure)
      and (provolatile <> 's' or not prosecdef
        or not coalesce(proconfig @> array['search_path=""'], false))) then
    raise exception 'review and dashboard must remain stable security definer functions with an empty search_path';
  end if;
  foreach threshold in array array[null, 0.59, 1.0]::double precision[] loop
    begin
      perform * from public.question_import_review(threshold);
      raise exception 'import review accepted invalid threshold %', threshold;
    exception when raise_exception then
      if sqlerrm <> 'invalid threshold' then raise; end if;
    end;
  end loop;
  foreach threshold in array array[0.60, 0.99]::double precision[] loop
    perform * from public.question_import_review(threshold);
  end loop;

  select extensions.similarity(a.stem, b.stem) into s from public.questions a, public.questions b
    where a.id = 'c2-threshold' and b.id = 'c2-threshold-live';
  if s <= 0.60 or s >= 0.98 then raise exception 'bad trigram threshold fixture: %', s; end if;
  perform set_config('pg_trgm.similarity_threshold', '0.99', true);
  if not exists (select 1 from public.question_import_review(s - 0.01) where id = 'c2-threshold') then
    raise exception 'candidate search must lower the trigram threshold';
  end if;
  perform set_config('pg_trgm.similarity_threshold', '0.60', true);
  if exists (select 1 from public.question_import_review(s + 0.01) where id = 'c2-threshold') then
    raise exception 'candidate search must reject scores below threshold';
  end if;

  select extensions.similarity(a.stem, b.stem) into s from public.questions a, public.questions b
    where a.id = 'c2-best' and b.id = 'c2-1-low';
  if s < 0.82 or s >= 1 then raise exception 'bad best-score ordering fixture: %', s; end if;
  select * into pair from public.question_import_review(0.82) where id = 'c2-best';
  if not found or pair.draft is distinct from jsonb_build_object('id','c2-best','stem',
      'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar nova','source','DraftToken','status','draft')
    or pair.row is distinct from jsonb_build_object('id','c2-a-win','stem',
      'Zephyr quasar nebula photon orbit spectrum gravity cosmic pulsar nova','source','MatchToken','status','live')
    or pair.score is distinct from 1::double precision then
    raise exception 'review JSON/score or best match ordering (score desc, id asc, retired excluded) changed';
  end if;
  if not exists (select 1 from public.question_import_review(0.99) where id = 'c2-mcq'
      and "row"->>'id' = 'c2-0-retired' and score < 0.60) then
    raise exception 'explicit duplicates must bypass threshold and retirement';
  end if;
  if exists (select 1 from public.question_import_review(0.60) where id = 'c2-self') then
    raise exception 'explicit duplicates must never self-match';
  end if;

  for c in select * from (values
    ('{}'::jsonb, array['c2-best','c2-complete','c2-mcq']),
    ('{"q":"C2-BEST"}', array['c2-best']),
    ('{"q":"DraftToken"}', array['c2-best']),
    ('{"q":"zephyr"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"q":"c2-a-win"}', array['c2-best']),
    ('{"q":"MATCHTOKEN"}', array['c2-best']),
    ('{"q":"absent needle"}', array[]::text[]),
    ('{"type":"short"}', array['c2-best']),
    ('{"type":"mcq"}', array['c2-mcq']),
    ('{"type":"other"}', array[]::text[]),
    ('{"topic":"c2-parent"}', array['c2-best']),
    ('{"topic":"c2-child"}', array['c2-best']),
    ('{"topic":"c2-other"}', array['c2-complete','c2-mcq']),
    ('{"topic":"absent"}', array[]::text[]),
    ('{"from":"2024","to":"2024"}', array['c2-best']),
    ('{"from":"2025"}', array['c2-complete']),
    ('{"to":"2020"}', array['c2-mcq']),
    ('{"from":"invalid","to":"99999"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"origin":"a1"}', array['c2-best']),
    ('{"origin":"nesa"}', array['c2-complete','c2-mcq']),
    -- questions.verb is dropped: a stale client's verb filter is ignored.
    ('{"verb":"Describe"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"marks":"4"}', array['c2-best']),
    ('{"marks":"99"}', array[]::text[]),
    ('{"marks":"100"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"marks":"bad"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"paper":"yes"}', array['c2-best']),
    ('{"paper":"no"}', array['c2-complete','c2-mcq']),
    ('{"paper":"other"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"missing":"explanation"}', array['c2-mcq']),
    ('{"missing":"sample"}', array['c2-best']),
    ('{"missing":"criteria"}', array['c2-best']),
    ('{"missing":"stimulus"}', array['c2-best']),
    ('{"missing":"other"}', array['c2-best','c2-complete','c2-mcq']),
    ('{"q":"","type":"","topic":"","from":"","to":"","origin":"","verb":"","marks":"","paper":"","missing":""}', array['c2-best','c2-complete','c2-mcq']),
    ('{"q":null,"type":null,"topic":null,"from":null,"to":null,"origin":null,"verb":null,"marks":null,"paper":null,"missing":null}', array['c2-best','c2-complete','c2-mcq']),
    ('{"type":"short","origin":"a1","topic":"c2-parent","from":"2024","to":"2024","verb":"Explain","marks":"4","paper":"yes","missing":"sample"}', array['c2-best'])
  ) cases(filters, expected) loop
    expected := c.expected;
    if to_regclass('public.papers') is null then
      if c.filters->>'paper' = 'yes' then expected := array[]::text[];
      elsif c.filters->>'paper' = 'no' then expected := array['c2-best','c2-complete','c2-mcq'];
      end if;
    end if;
    select coalesce(array_agg(id order by id), array[]::text[]) into actual
      from public.question_import_review(0.82, c.filters) where id in ('c2-best','c2-complete','c2-mcq');
    if actual is distinct from expected then
      raise exception 'import review filter %: expected %, got %', c.filters, expected, actual;
    end if;
  end loop;
end $$;

-- 0079: unpublished paper questions remain drafts for history, not import review.
-- First prove both fixtures qualify, so exclusion cannot pass on an unmatched draft.
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);
do $$
declare
  baseline bigint := (public.admin_dashboard() #>> '{attention,importReview}')::bigint;
  actual text[];
begin
  insert into public.questions (id, type, topic_id, marks, stem, criteria, source, year, status, duplicate_of) values
    ('c2-paper-history', 'short', 'c2-other', 4, 'Unpublished paper history fixture', '[]', 'SQL test', 2026, 'draft', 'c2-0-retired'),
    ('c2-ordinary-draft', 'short', 'c2-other', 4, 'Ordinary import draft fixture', '[]', 'SQL test', 2026, 'draft', 'c2-0-retired');
  select array_agg(id order by id) into actual from public.question_import_review()
    where id in ('c2-paper-history', 'c2-ordinary-draft');
  if actual is distinct from array['c2-ordinary-draft','c2-paper-history']
    or (public.admin_dashboard() #>> '{attention,importReview}')::bigint is distinct from baseline + 2 then
    raise exception 'both ordinary drafts must qualify for import review and the dashboard count';
  end if;

  insert into public.unpublished_paper_questions (question_id) values ('c2-paper-history');
  select array_agg(id order by id) into actual from public.question_import_review()
    where id in ('c2-paper-history', 'c2-ordinary-draft');
  if actual is distinct from array['c2-ordinary-draft'] then
    raise exception 'import review must exclude unpublished paper drafts and retain ordinary drafts: %', actual;
  end if;
  if (public.admin_dashboard() #>> '{attention,importReview}')::bigint is distinct from baseline + 1 then
    raise exception 'dashboard importReview must exclude only the unpublished paper draft';
  end if;
end $$;

-- Observe the dashboard's threshold inside the real % operator: function-local
-- GUC changes are restored on return. Force evaluation rather than an index recheck.
set local enable_indexscan = off;
set local enable_bitmapscan = off;
create temporary sequence c2_operator_calls;
grant select on sequence c2_operator_calls to authenticated, service_role;
do $$
begin
  execute replace(pg_get_functiondef('extensions.similarity_op(text,text)'::regprocedure),
    'extensions.similarity_op', 'pg_temp.c2_real_similarity_op');
end $$;
create or replace function extensions.similarity_op(text, text) returns boolean
language plpgsql volatile strict as $$
begin
  if current_setting('pg_trgm.similarity_threshold')::real <> 0.82::real then
    raise exception 'admin_dashboard must set trigram threshold to 0.82 before using %%';
  end if;
  perform nextval('pg_temp.c2_operator_calls');
  return pg_temp.c2_real_similarity_op($1, $2);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);
do $$
begin
  perform set_config('pg_trgm.similarity_threshold', '0.99', true);
  perform public.admin_dashboard();
  if not (select is_called from pg_temp.c2_operator_calls) then
    raise exception 'dashboard threshold assertion must exercise the trigram operator';
  end if;
  if to_regprocedure('public.admin_import_review(double precision,jsonb)') is not null then
    if not exists (select 1 from public.admin_import_review() where id = 'c2-best' and "row"->>'id' = 'c2-a-win') then
      raise exception 'admin import wrapper must retain the review contract';
    end if;
  end if;
end $$;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000002', true);
do $$
begin
  if to_regprocedure('public.admin_import_review(double precision,jsonb)') is not null then
    begin
      perform * from public.admin_import_review();
      raise exception 'admin_import_review allowed a non-admin';
    exception when raise_exception then
      if sqlerrm <> 'admin only' then raise; end if;
    end;
  end if;
  if has_function_privilege(current_user, 'public.question_import_review(double precision,jsonb)', 'execute') then
    raise exception 'authenticated can execute service-only question_import_review';
  end if;
  begin
    perform * from public.question_import_review();
    raise exception 'authenticated can execute service-only question_import_review';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$
begin
  if has_function_privilege(current_user, 'public.question_import_review(double precision,jsonb)', 'execute') then
    raise exception 'anon can execute service-only question_import_review';
  end if;
  begin
    perform * from public.question_import_review();
    raise exception 'anon can execute service-only question_import_review';
  exception when insufficient_privilege then null;
  end;
  if to_regprocedure('public.admin_import_review(double precision,jsonb)') is not null then
    begin
      perform * from public.admin_import_review();
      raise exception 'anon can execute admin_import_review';
    exception when insufficient_privilege then null;
    end;
  end if;
end $$;
set local role service_role;
do $$
declare calls bigint := (select last_value from pg_temp.c2_operator_calls);
begin
  if not exists (select 1 from public.question_import_review() where id = 'c2-best') then
    raise exception 'service_role must be able to execute question_import_review';
  end if;
  if (select last_value from pg_temp.c2_operator_calls) <= calls then
    raise exception 'candidate matching must use the trigram operator';
  end if;
end $$;
rollback;
