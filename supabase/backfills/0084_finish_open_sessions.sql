-- One-off backfill for 0084 (no session resume). NOT a migration and never auto-run: CI applies only
-- supabase/migrations/*.sql. The PM runs it by hand after migration 0084, then decides commit/rollback.
--
-- Same rules as the app (src/lib/session-finish.ts → engine finishSession):
--   • scope: open sessions (finished_at is null) of kind 'sprint' or 'flashcards' with no activity for
--     30 minutes (public.session_last_active_at, migration 0084). Live sessions are left alone.
--   • MC: 1 mark if the chosen option is the key, else 0 (scoreMcq). No choice → 0, "Not answered".
--   • Written with fewer than 3 words → 0, feedback {"note":"No answer"} ("Not answered").
--   • Decks: score = sum of each card's first rating, max = cards rated.
--   • Written answers with 3+ words need AI marking, which SQL cannot do. Those sprints are SKIPPED
--     here and finished by the app engine (finishOpenSessions in src/lib/session-finish.ts): the
--     lazy sweep ends them on the student's next request, with the usual AI allowance checks.
-- Differences from the engine: summary stays null for SQL-finished sprints (the engine writes a
-- deterministic per-topic summary for MC-only sprints; the results page shows no summary card then).

begin;
set local lock_timeout = '5s';

create temp table backfill_targets on commit drop as
select s.id, s.kind
from public.sessions s
where s.finished_at is null
  and s.kind in ('sprint', 'flashcards')
  and public.session_last_active_at(s) < now() - interval '30 minutes'
  and (s.kind = 'flashcards' or not public.session_needs_ai_finish(s.id))
  -- leave sprints with a live marking claim to the engine
  and not exists (select 1 from public.attempts a where a.session_id = s.id
    and a.status = 'marking' and a.claimed_at > now() - interval '5 minutes');

select kind, count(*) as to_finish from backfill_targets group by kind;

with locked as (
  select s.id from public.sessions s join backfill_targets t on t.id = s.id for update of s
)
select count(*) as locked from locked;

-- MC: deterministic score.
update public.attempts a
set status = 'marked', mark = case when a.choice_index = q.correct_index then 1 else 0 end,
  max_marks = 1, band = null, marked_by_model = 'deterministic', marked_at = now(),
  feedback = jsonb_build_object('correct_index', q.correct_index, 'chosen_index', a.choice_index)
from backfill_targets t, public.questions q
where a.session_id = t.id and t.kind = 'sprint' and q.id = a.question_id and q.type = 'mcq'
  and a.status <> 'marked';

-- Written, not answered (session_needs_ai_finish is false, so no unmarked 3+ word answer remains).
update public.attempts a
set status = 'marked', mark = 0, max_marks = q.marks, band = null,
  feedback = '{"note":"No answer"}'::jsonb, check_status = 'skipped',
  marked_by_model = 'deterministic', marked_at = now()
from backfill_targets t, public.questions q
where a.session_id = t.id and t.kind = 'sprint' and q.id = a.question_id and q.type <> 'mcq'
  and a.status <> 'marked';

-- Sprints: score over all attempts (totals() in the engine).
update public.sessions s
set finished_at = now(), score = x.score, max_score = x.max_score, summary = null
from (
  select t.id, coalesce(sum(case when a.status = 'marked' then coalesce(a.mark, 0) else 0 end), 0) as score,
    coalesce(sum(coalesce(a.max_marks, q.marks)), 0) as max_score
  from backfill_targets t
  left join public.attempts a on a.session_id = t.id
  left join public.questions q on q.id = a.question_id
  where t.kind = 'sprint'
  group by t.id
) x
where s.id = x.id and s.finished_at is null;

-- Decks: first rating per card.
update public.sessions s
set finished_at = now(), score = x.score, max_score = x.max_score
from (
  select t.id, coalesce(sum(f.mark), 0) as score, count(f.mark) as max_score
  from backfill_targets t
  left join lateral (
    select distinct on (r.flashcard_id) r.mark
    from public.flashcard_reviews r
    where r.session_id = t.id
    order by r.flashcard_id, r.created_at, r.id
  ) f on true
  where t.kind = 'flashcards'
  group by t.id
) x
where s.id = x.id and s.finished_at is null;

-- Check, then run COMMIT by hand. The default is to discard.
select count(*) as still_open_sprints_or_decks from public.sessions
  where finished_at is null and kind in ('sprint', 'flashcards');
rollback;
