-- Rollback:
-- DROP POLICY "valid self review association" ON public.flashcard_reviews;

-- card_ids is the selected deck snapshot used by loadFlashcards/rateFlashcard.
-- Do not reapply setup filters: an owned card can move/retire during a session.
-- The flashcards SELECT policy enforces shared-live / own visibility. Only use
-- columns granted in 0038; origin and origin_ref must remain hidden.
create policy "valid self review association" on public.flashcard_reviews
  as restrictive for insert to authenticated
  with check (exists (
    select 1
    from public.sessions s
    join public.flashcards f on f.id = flashcard_reviews.flashcard_id
    where s.id = flashcard_reviews.session_id
      and s.user_id = (select auth.uid())
      and s.kind = 'flashcards'
      and s.finished_at is null
      and s.config->>'mode' in ('study', 'test')
      and jsonb_typeof(s.config->'card_ids') = 'array'
      and s.config->'card_ids' ? f.id
      and (f.owner_id is null or f.owner_id = (select auth.uid()))
  ));
