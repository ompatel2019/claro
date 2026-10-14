-- A2: keep imports in the offline service path; the editor only updates existing rows.
create or replace function public.admin_save_question(p_row jsonb, p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.questions;
  v_new public.questions;
  v_time timestamptz := clock_timestamp();
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  v_new := jsonb_populate_record(null::public.questions, p_row);
  if not exists (select 1 from public.topics where id = v_new.topic_id and parent_id is not null) then
    return jsonb_build_object('error', 'Choose a subtopic.'); end if;
  if p_expected is null then
    return jsonb_build_object('error', 'Import questions before editing them.');
  end if;
    select * into v_old from public.questions where id = v_new.id for update;
    if not found then return jsonb_build_object('error', 'This question no longer exists.'); end if;
    if v_old.updated_at <> p_expected then return jsonb_build_object('conflict', v_old.updated_at); end if;
    if (v_new.type <> v_old.type or v_new.marks <> v_old.marks) and
      exists (select 1 from public.attempts where question_id = v_old.id) then
      return jsonb_build_object('error', 'Has attempts. Type and marks are locked.'); end if;
    update public.questions set type=v_new.type,topic_id=v_new.topic_id,marks=v_new.marks,verb=v_new.verb,
      source=v_new.source,year=v_new.year,stem=v_new.stem,stimulus=v_new.stimulus,options=v_new.options,
      correct_index=v_new.correct_index,explanation=v_new.explanation,criteria=v_new.criteria,
      guideline_notes=v_new.guideline_notes,sample_answer=v_new.sample_answer,status=v_new.status,updated_at=v_time
    where id=v_new.id;
  return jsonb_build_object('ok', true, 'id', v_new.id, 'updated_at', v_time);
end;
$$;
