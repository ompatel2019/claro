-- Rollback:
-- DROP POLICY "valid self review association" ON public.flashcard_reviews;

-- card_ids is the selected deck snapshot used by loadFlashcards/rateFlashcard.
-- Mirrors rateFlashcard's own checks. Deliberately no join to flashcards: its
-- RLS hides cards retired mid-session, and those ratings must keep working.
create policy "valid self review association" on public.flashcard_reviews
  as restrictive for insert to authenticated
  with check (exists (
    select 1
    from public.sessions s
    where s.id = flashcard_reviews.session_id
      and s.user_id = (select auth.uid())
      and s.kind = 'flashcards'
      and s.finished_at is null
      and s.config->>'mode' in ('study', 'test')
      and jsonb_typeof(s.config->'card_ids') = 'array'
      and s.config->'card_ids' ? flashcard_reviews.flashcard_id
  ));
