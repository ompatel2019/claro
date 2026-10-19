-- Requires Om/master sign-off before production application.
-- KILL_LIST E8: admin question stats / recent answers filter attempts by question_id,
-- and review history filters mark_reviews by attempt_id; neither has a leading index
-- (the partial mark_reviews_one_open unique index covers open reviews only and stays).
-- Local EXPLAIN at 300k attempts / 60k reviews: see the PR notes.
create index if not exists attempts_question_id_idx on public.attempts (question_id);
create index if not exists mark_reviews_attempt_id_idx on public.mark_reviews (attempt_id);
