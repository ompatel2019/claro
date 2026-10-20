-- Requires Om/master sign-off before production application.
-- KILL_LIST E1: the Papers feature was removed from the app; these RPCs have no
-- caller in the repo and a zero pg_stat_statements delta since the 2026-10-20 snapshot.
-- Exact signatures, no CASCADE: any unexpected dependency makes this fail loudly.
-- The papers / paper_questions tables and their sprint exclusion stay (E6).
drop function if exists public.start_paper(uuid, boolean);
drop function if exists public.paper_rank(uuid);
drop function if exists public.admin_paper_rows();
drop function if exists public.admin_save_paper(uuid, jsonb, text, boolean, timestamptz);
drop function if exists public.admin_retire_papers(uuid[]);
