-- Rollback:
-- drop policy "live eligible question insert" on public.attempts;
-- drop trigger bound_sprint_attempts on public.attempts;
-- drop function public.bound_sprint_attempts();
-- alter table public.attempts drop constraint attempts_answer_text_length;
-- alter table public.attempts drop constraint attempts_transcript_length;

-- Add to the ownership/single-check guards; do not replace permissive policies.
-- authenticated can SELECT questions.id/status and invoke sprint_questions.
create policy "live eligible question insert" on public.attempts
  as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.questions q
      where q.id = question_id and q.status = 'live')
    and exists (select 1 from public.sessions s
      where s.id = session_id and s.kind = 'sprint'
      and s.config ->> 'mode' in ('mcq', 'short', 'mixed') and exists (
        select 1 from public.sprint_questions(s.config - 'include_extended') q
        where q.id = question_id
          and case s.config ->> 'history'
            when 'new_only' then not q.seen
            when 'mistakes' then q.mistake
            when 'flagged' then q.flagged
            else true end
      ))
  );

-- 0016 introduced the JSON builder; 0021 added the shared pool. The current
-- 0046/0050 builder allocates at most 40 MCQs, 15 short questions, 60 short
-- marks, or 100 mixed marks plus two marks of tolerance. Questions have marks
-- > 0 (0002), so 102 is a conservative absolute attempt ceiling. Also respect
-- smaller targets, never trusting client-supplied actual_questions/actual_marks.
-- Lock the parent before counting so concurrent or multi-row inserts cannot
-- bypass the bound. Client flashcards use reviews; singles use service writes.
create function public.bound_sprint_attempts() returns trigger
language plpgsql set search_path = '' as $$
declare cfg jsonb; allocation int;
begin
  select s.config into cfg from public.sessions s where s.id = new.session_id
    for no key update;
  allocation := case cfg ->> 'mode'
    when 'mcq' then least(coalesce((cfg ->> 'target')::int, 20), 40)
    when 'short' then case when cfg ->> 'size_by' = 'questions'
      then least(coalesce((cfg ->> 'target')::int, 30), 15)
      else least(coalesce((cfg ->> 'target')::int, 30), 60) end
    when 'mixed' then least(coalesce((cfg ->> 'target')::int, 45), 100) + 2
    else 0 end;
  if (select count(*) from public.attempts a where a.session_id = new.session_id) >= allocation then
    raise insufficient_privilege using message = 'Sprint attempt allocation exceeded';
  end if;
  return new;
end $$;
revoke all on function public.bound_sprint_attempts() from public, anon, authenticated;
create trigger bound_sprint_attempts before insert on public.attempts
  for each row when (current_user = 'authenticated')
  execute function public.bound_sprint_attempts();

-- Identity/marking columns already have no authenticated UPDATE grant. Keep
-- answer edits working even if a legitimately selected question is later retired.

-- UI: 3,000 words (no character ceiling on direct answer saves); PATCH: 100,000
-- characters. One million is far above realistic answers, including essays.
-- NOT VALID preserves unknown historical rows while checking new writes.
alter table public.attempts add constraint attempts_answer_text_length
  check (char_length(answer_text) <= 1000000) not valid;
alter table public.attempts add constraint attempts_transcript_length
  check (char_length(transcript) <= 1000000) not valid;
