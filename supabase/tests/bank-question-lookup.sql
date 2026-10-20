-- E13: the targeted lookup must equal full-bank membership under student RLS.
begin;
insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000e13', 'e13-synthetic@example.test');
insert into public.topics(id, name, sort) values ('e13-topic', 'Synthetic E13', 99);
insert into public.questions(id, type, topic_id, marks, stem, criteria, source, year, origin, status)
select id, type, 'e13-topic', marks, 'Synthetic E13 question ' || id, '[]'::jsonb,
  'Synthetic E13', 2026, 'claro', status
from (values
  ('e13-short', 'short', 4, 'live'),
  ('e13-extended', 'extended', 20, 'live'),
  ('e13-retired', 'short', 4, 'retired'),
  ('e13-draft', 'short', 4, 'draft')
) as fixtures(id, type, marks, status);
insert into public.questions(id, type, topic_id, marks, stem, options, correct_index, source, year, origin, status)
values ('e13-mcq', 'mcq', 'e13-topic', 1, 'Synthetic MCQ', array['A','B','C','D'], 0,
  'Synthetic E13', 2026, 'claro', 'live');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000e13', true);
do $$
declare candidate text; old_result boolean; new_result boolean; expected boolean;
begin
  foreach candidate in array array[
    'e13-short', 'e13-extended', 'e13-retired', 'e13-draft',
    'e13-mcq', 'e13-unknown', ' e13-short ', 'E13-SHORT', 'bad,id).or(id.eq.e13-short)'
  ] loop
    -- Old: load all pool IDs, then live questions, then exact ID membership.
    select exists (
      select 1 from public.questions q
      where q.id in (
        select p.id from public.sprint_questions('{"mode":"mixed","include_extended":true}') p
        where p.type <> 'mcq'
      ) and q.status = 'live' and q.id = candidate
    ) into old_result;
    -- New: both reads are filtered to the supplied ID, with the same predicates.
    select exists (
      select 1 from public.sprint_questions('{"mode":"mixed","include_extended":true}') p
      where p.id = candidate and p.type <> 'mcq'
    ) and exists (
      select 1 from public.questions q where q.id = candidate and q.status = 'live'
    ) into new_result;
    expected := candidate in ('e13-short', 'e13-extended');
    if old_result is distinct from expected or new_result is distinct from old_result then
      raise exception 'E13 membership mismatch for %: old %, new %, expected %',
        candidate, old_result, new_result, expected;
    end if;
  end loop;
end $$;
rollback;
