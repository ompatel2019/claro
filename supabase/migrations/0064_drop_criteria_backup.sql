-- Requires Om/master sign-off before production application.
-- KILL_LIST E5: drop the one-off S9 rollback backup (6 rows, no reader). Its rows are
-- archived off-database (cleanup/archive/questions_criteria_backup_20261019.json,
-- sha256 25c7f472…d7d8fb). Refuse to drop if the contents differ from that archive.
do $$
declare n bigint; h text;
begin
  if to_regclass('public.questions_criteria_backup_20261019') is null then return; end if;
  select count(*), md5(string_agg(id::text || '|' || criteria::text || '|'
      || extract(epoch from taken_at)::text, ',' order by id))
    into n, h from public.questions_criteria_backup_20261019;
  if n <> 6 or h is distinct from '9c0ce01fcb12ab14af1ff080c17ea233' then
    raise exception 'criteria backup differs from the archive (% rows, %); not dropping', n, h;
  end if;
  drop table public.questions_criteria_backup_20261019;
end
$$;
