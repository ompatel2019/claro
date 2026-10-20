-- Requires Om/master sign-off before production application.
-- KILL_LIST E2/E3: dashboard_stats() (and topic_progress, read only by it) and
-- review_queue have no app caller and a zero pg_stat_statements delta since the
-- 2026-10-20 snapshot. Exact signatures, no CASCADE.
drop function if exists public.dashboard_stats();
drop view if exists public.topic_progress;
drop view if exists public.review_queue;
