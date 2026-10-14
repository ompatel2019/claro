-- A6: link future individual marking/transcription spend without guessing historical attribution.
alter table public.ai_usage add column if not exists attempt_id uuid references public.attempts(id) on delete set null;
create index if not exists ai_usage_attempt_id on public.ai_usage(attempt_id) where attempt_id is not null;
