-- Rollback:
-- drop policy "live eligible question insert" on public.attempts;
-- alter table public.attempts drop constraint attempts_answer_text_length;

-- Add to the ownership/single-check guards; do not replace permissive policies.
-- authenticated can SELECT questions.id/status and invoke sprint_questions.
create policy "live eligible question insert" on public.attempts
  as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.questions q
      where q.id = question_id and q.status = 'live')
    and exists (select 1 from public.sessions s
      where s.id = session_id and (s.kind <> 'sprint' or exists (
        select 1 from public.sprint_questions(s.config - 'include_extended') q
        where q.id = question_id
          and case s.config ->> 'history'
            when 'new_only' then not q.seen
            when 'mistakes' then q.mistake
            when 'flagged' then q.flagged
            else true end
      )))
  );

-- Identity/marking columns already have no authenticated UPDATE grant. Keep
-- answer edits working even if a legitimately selected question is later retired.

-- UI: 3,000 words (no character ceiling on direct answer saves); PATCH: 100,000
-- characters. One million is far above realistic answers, including essays.
-- NOT VALID preserves unknown historical rows while checking new writes.
alter table public.attempts add constraint attempts_answer_text_length
  check (char_length(answer_text) <= 1000000) not valid;
